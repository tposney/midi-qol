import type { MidiCardSection } from "../ChatClasses/UsageCardMessage.js";
/**
 * The workflow's state on its usage card: `system.midi.state` (scalars) and `system.midi.records` (one record per
 * token, keyed by scene id then token id, as a duplicated scene keeps its token ids; a token set is the records with its
 * field set). Read back when a workflow is rebuilt from its card.
 */
/**
 * Workflow scalars stored in `system.midi.state`: only what a rebuilt workflow cannot work out from its card (rolls,
 * activity) and the canvas, or what other readers need (the damage tray's matches).
 */
export declare const STATE_KEYS: readonly ["isCritical", "isFumble", "templateUuids", "workflowOptions", "saveMults", "damageOnly", "otherConsumed", "otherDeclined", "otherScaling", "ammunitionData", "inCombat", "isTurn", "deferredConcentration", "useChanges", "damageRules", "stepChanges", "stepMove", "damageMessages", "tagSnapshots", "choices", "redirections"];
export type StateKey = typeof STATE_KEYS[number];
/**
 * Workflow token sets: record field, and its old flag name (a uuid array; `targets` was `{uuid, name}`). Macros change them, so they are stored.
 * Not the save advantage sets: a rebuilt workflow has them from the records' `saveMode`.
 */
export declare const RECORD_SETS: {
    readonly targets: "targets";
    readonly hit: "hitTargetUuids";
    readonly hitEC: "hitECTargetUuids";
    readonly saved: "saveUuids";
    readonly superSaver: "superSaverUuids";
    readonly semiSuperSaver: "semiSuperSaverUuids";
    readonly failedSave: "failedSaveUuids";
    readonly fumbleSave: "fumbleSaveUuids";
    readonly criticalSave: "criticalSaveUuids";
};
export type RecordSet = keyof typeof RECORD_SETS;
/** A token's facts on the card besides its sets: its save row, hits row and damage-tray matches, as midi decided them */
export type RecordFacts = {
    saveTotal?: number | null;
    saveCover?: "half" | "threeQuarters" | "total";
    saveCoverAuto?: boolean;
    saveMode?: number | null;
    saveAttribution?: string[][];
    uncannyDodge?: boolean;
    uncannyDodgeIcon?: string;
    otherDamage?: boolean;
    ammunitionDamage?: boolean;
    preSelected?: number | null;
    canSee?: boolean;
    canSense?: boolean;
    seesActor?: boolean;
    sensesActor?: boolean;
    hitClass?: string | null;
    hitSymbol?: string | null;
    hitShowAC?: boolean | null;
    acDisplay?: string | null;
    acTooltip?: string | null;
    acIcons?: {
        img?: string;
        icon?: string;
        tooltip?: string;
        cssClass?: string;
        useDnd5eIcon?: boolean;
    }[] | null;
};
export type CardRecord = {
    uuid: string;
} & Partial<Record<RecordSet, boolean>> & RecordFacts;
export declare function cardStateSchema(): {
    state: import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField<{
        readonly workflowClass: import("fvtt-types/src/foundry/common/data/fields.mjs").StringField<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>>;
        readonly flow: import("fvtt-types/src/foundry/common/data/fields.mjs").StringField<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>>;
        readonly step: import("fvtt-types/src/foundry/common/data/fields.mjs").StringField<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>>;
        readonly stepChanges: import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions>, import("fvtt-types/src/utils/index.mjs").AnyMutableObject, import("fvtt-types/src/utils/index.mjs").AnyMutableObject>, {
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions>, import("fvtt-types/src/utils/index.mjs").AnyMutableObject, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions>, {
            required: boolean;
            initial: undefined;
        }>, import("fvtt-types/src/utils/index.mjs").AnyMutableObject[], import("fvtt-types/src/utils/index.mjs").AnyMutableObject, import("fvtt-types/src/utils/index.mjs").AnyMutableObject[]>;
        readonly stepMove: import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>;
        readonly isCritical: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly isFumble: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly templateUuids: import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>>, {
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, {
            required: boolean;
            initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>[], import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>[]>;
        readonly workflowOptions: import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<{
            required: boolean;
            initial: undefined;
        }>, import("fvtt-types/src/utils/index.mjs").AnyMutableObject, import("fvtt-types/src/utils/index.mjs").AnyMutableObject>;
        readonly saveMults: import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<{
            required: boolean;
            initial: undefined;
        }>, import("fvtt-types/src/utils/index.mjs").AnyMutableObject, import("fvtt-types/src/utils/index.mjs").AnyMutableObject>;
        readonly otherDamageMatched: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly ammunitionDamageMatched: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly damageOnly: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly otherConsumed: import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>;
        readonly otherDeclined: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly otherScaling: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.AssignmentType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>;
        readonly ammunitionData: import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<{
            required: boolean;
            initial: undefined;
        }>, import("fvtt-types/src/utils/index.mjs").AnyMutableObject, import("fvtt-types/src/utils/index.mjs").AnyMutableObject>;
        readonly inCombat: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly isTurn: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly deferredConcentration: import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>;
        readonly useChanges: import("fvtt-types/src/foundry/common/data/fields.mjs").StringField<{
            readonly blank: true;
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>>;
        readonly damageMessages: import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField<import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField<{
            readonly key: /*elided*/ any;
            readonly id: /*elided*/ any;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField.Internal.AssignmentType<{
            readonly key: /*elided*/ any;
            readonly id: /*elided*/ any;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField.DefaultOptions>, {
            key: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
                readonly blank: false;
            }>>, {
                initial: undefined;
            }>>;
            id: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
                readonly blank: false;
            }>>, {
                initial: undefined;
            }>>;
        }, {
            key: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
                readonly blank: false;
            }>>, {
                initial: undefined;
            }>>;
            id: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
                readonly blank: false;
            }>>, {
                initial: undefined;
            }>>;
        }>, {
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField.Internal.AssignmentType<{
            readonly key: /*elided*/ any;
            readonly id: /*elided*/ any;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField.DefaultOptions>, {
            key: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
                readonly blank: false;
            }>>, {
                initial: undefined;
            }>>;
            id: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
                readonly blank: false;
            }>>, {
                initial: undefined;
            }>>;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField.Internal.AssignmentType<{
            readonly key: /*elided*/ any;
            readonly id: /*elided*/ any;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField.DefaultOptions>, {
            required: boolean;
            initial: undefined;
        }>, {
            key: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
                readonly blank: false;
            }>>, {
                initial: undefined;
            }>>;
            id: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
                readonly blank: false;
            }>>, {
                initial: undefined;
            }>>;
        }[], {
            key: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
                readonly blank: false;
            }>>, {
                initial: undefined;
            }>>;
            id: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
                readonly blank: false;
            }>>, {
                initial: undefined;
            }>>;
        }, {
            key: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
                readonly blank: false;
            }>>, {
                initial: undefined;
            }>>;
            id: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
                readonly blank: false;
            }>>, {
                initial: undefined;
            }>>;
        }[]>;
        readonly tagSnapshots: import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions>, import("fvtt-types/src/utils/index.mjs").AnyMutableObject, import("fvtt-types/src/utils/index.mjs").AnyMutableObject>, {
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions>, import("fvtt-types/src/utils/index.mjs").AnyMutableObject, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions>, {
            required: boolean;
            initial: undefined;
        }>, import("fvtt-types/src/utils/index.mjs").AnyMutableObject[], import("fvtt-types/src/utils/index.mjs").AnyMutableObject, import("fvtt-types/src/utils/index.mjs").AnyMutableObject[]>;
        readonly choices: import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions>, import("fvtt-types/src/utils/index.mjs").AnyMutableObject, import("fvtt-types/src/utils/index.mjs").AnyMutableObject>, {
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions>, import("fvtt-types/src/utils/index.mjs").AnyMutableObject, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions>, {
            required: boolean;
            initial: undefined;
        }>, import("fvtt-types/src/utils/index.mjs").AnyMutableObject[], import("fvtt-types/src/utils/index.mjs").AnyMutableObject, import("fvtt-types/src/utils/index.mjs").AnyMutableObject[]>;
        readonly damageRules: import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField<{
            readonly downgrade: /*elided*/ any;
            readonly ignore: /*elided*/ any;
        }, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField.Internal.AssignmentType<{
            readonly downgrade: /*elided*/ any;
            readonly ignore: /*elided*/ any;
        }, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField.Internal.InitializedType<{
            readonly downgrade: /*elided*/ any;
            readonly ignore: /*elided*/ any;
        }, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField.Internal.PersistedType<{
            readonly downgrade: /*elided*/ any;
            readonly ignore: /*elided*/ any;
        }, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>;
    }, {
        readonly required: false;
    }, import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField.Internal.AssignmentType<{
        readonly workflowClass: import("fvtt-types/src/foundry/common/data/fields.mjs").StringField<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>>;
        readonly flow: import("fvtt-types/src/foundry/common/data/fields.mjs").StringField<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>>;
        readonly step: import("fvtt-types/src/foundry/common/data/fields.mjs").StringField<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>>;
        readonly stepChanges: import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions>, import("fvtt-types/src/utils/index.mjs").AnyMutableObject, import("fvtt-types/src/utils/index.mjs").AnyMutableObject>, {
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions>, import("fvtt-types/src/utils/index.mjs").AnyMutableObject, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions>, {
            required: boolean;
            initial: undefined;
        }>, import("fvtt-types/src/utils/index.mjs").AnyMutableObject[], import("fvtt-types/src/utils/index.mjs").AnyMutableObject, import("fvtt-types/src/utils/index.mjs").AnyMutableObject[]>;
        readonly stepMove: import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>;
        readonly isCritical: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly isFumble: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly templateUuids: import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>>, {
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, {
            required: boolean;
            initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>[], import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>[]>;
        readonly workflowOptions: import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<{
            required: boolean;
            initial: undefined;
        }>, import("fvtt-types/src/utils/index.mjs").AnyMutableObject, import("fvtt-types/src/utils/index.mjs").AnyMutableObject>;
        readonly saveMults: import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<{
            required: boolean;
            initial: undefined;
        }>, import("fvtt-types/src/utils/index.mjs").AnyMutableObject, import("fvtt-types/src/utils/index.mjs").AnyMutableObject>;
        readonly otherDamageMatched: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly ammunitionDamageMatched: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly damageOnly: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly otherConsumed: import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>;
        readonly otherDeclined: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly otherScaling: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.AssignmentType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>;
        readonly ammunitionData: import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<{
            required: boolean;
            initial: undefined;
        }>, import("fvtt-types/src/utils/index.mjs").AnyMutableObject, import("fvtt-types/src/utils/index.mjs").AnyMutableObject>;
        readonly inCombat: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly isTurn: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly deferredConcentration: import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>;
        readonly useChanges: import("fvtt-types/src/foundry/common/data/fields.mjs").StringField<{
            readonly blank: true;
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>>;
        readonly damageMessages: import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField<import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField<{
            readonly key: /*elided*/ any;
            readonly id: /*elided*/ any;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField.Internal.AssignmentType<{
            readonly key: /*elided*/ any;
            readonly id: /*elided*/ any;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField.DefaultOptions>, {
            key: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
                readonly blank: false;
            }>>, {
                initial: undefined;
            }>>;
            id: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
                readonly blank: false;
            }>>, {
                initial: undefined;
            }>>;
        }, {
            key: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
                readonly blank: false;
            }>>, {
                initial: undefined;
            }>>;
            id: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
                readonly blank: false;
            }>>, {
                initial: undefined;
            }>>;
        }>, {
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField.Internal.AssignmentType<{
            readonly key: /*elided*/ any;
            readonly id: /*elided*/ any;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField.DefaultOptions>, {
            key: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
                readonly blank: false;
            }>>, {
                initial: undefined;
            }>>;
            id: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
                readonly blank: false;
            }>>, {
                initial: undefined;
            }>>;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField.Internal.AssignmentType<{
            readonly key: /*elided*/ any;
            readonly id: /*elided*/ any;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField.DefaultOptions>, {
            required: boolean;
            initial: undefined;
        }>, {
            key: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
                readonly blank: false;
            }>>, {
                initial: undefined;
            }>>;
            id: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
                readonly blank: false;
            }>>, {
                initial: undefined;
            }>>;
        }[], {
            key: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
                readonly blank: false;
            }>>, {
                initial: undefined;
            }>>;
            id: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
                readonly blank: false;
            }>>, {
                initial: undefined;
            }>>;
        }, {
            key: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
                readonly blank: false;
            }>>, {
                initial: undefined;
            }>>;
            id: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
                readonly blank: false;
            }>>, {
                initial: undefined;
            }>>;
        }[]>;
        readonly tagSnapshots: import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions>, import("fvtt-types/src/utils/index.mjs").AnyMutableObject, import("fvtt-types/src/utils/index.mjs").AnyMutableObject>, {
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions>, import("fvtt-types/src/utils/index.mjs").AnyMutableObject, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions>, {
            required: boolean;
            initial: undefined;
        }>, import("fvtt-types/src/utils/index.mjs").AnyMutableObject[], import("fvtt-types/src/utils/index.mjs").AnyMutableObject, import("fvtt-types/src/utils/index.mjs").AnyMutableObject[]>;
        readonly choices: import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions>, import("fvtt-types/src/utils/index.mjs").AnyMutableObject, import("fvtt-types/src/utils/index.mjs").AnyMutableObject>, {
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions>, import("fvtt-types/src/utils/index.mjs").AnyMutableObject, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions>, {
            required: boolean;
            initial: undefined;
        }>, import("fvtt-types/src/utils/index.mjs").AnyMutableObject[], import("fvtt-types/src/utils/index.mjs").AnyMutableObject, import("fvtt-types/src/utils/index.mjs").AnyMutableObject[]>;
        readonly damageRules: import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField<{
            readonly downgrade: /*elided*/ any;
            readonly ignore: /*elided*/ any;
        }, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField.Internal.AssignmentType<{
            readonly downgrade: /*elided*/ any;
            readonly ignore: /*elided*/ any;
        }, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField.Internal.InitializedType<{
            readonly downgrade: /*elided*/ any;
            readonly ignore: /*elided*/ any;
        }, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField.Internal.PersistedType<{
            readonly downgrade: /*elided*/ any;
            readonly ignore: /*elided*/ any;
        }, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>;
    }, {
        readonly required: false;
    }>, import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField.Internal.InitializedType<{
        readonly workflowClass: import("fvtt-types/src/foundry/common/data/fields.mjs").StringField<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>>;
        readonly flow: import("fvtt-types/src/foundry/common/data/fields.mjs").StringField<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>>;
        readonly step: import("fvtt-types/src/foundry/common/data/fields.mjs").StringField<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>>;
        readonly stepChanges: import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions>, import("fvtt-types/src/utils/index.mjs").AnyMutableObject, import("fvtt-types/src/utils/index.mjs").AnyMutableObject>, {
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions>, import("fvtt-types/src/utils/index.mjs").AnyMutableObject, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions>, {
            required: boolean;
            initial: undefined;
        }>, import("fvtt-types/src/utils/index.mjs").AnyMutableObject[], import("fvtt-types/src/utils/index.mjs").AnyMutableObject, import("fvtt-types/src/utils/index.mjs").AnyMutableObject[]>;
        readonly stepMove: import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>;
        readonly isCritical: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly isFumble: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly templateUuids: import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>>, {
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, {
            required: boolean;
            initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>[], import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>[]>;
        readonly workflowOptions: import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<{
            required: boolean;
            initial: undefined;
        }>, import("fvtt-types/src/utils/index.mjs").AnyMutableObject, import("fvtt-types/src/utils/index.mjs").AnyMutableObject>;
        readonly saveMults: import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<{
            required: boolean;
            initial: undefined;
        }>, import("fvtt-types/src/utils/index.mjs").AnyMutableObject, import("fvtt-types/src/utils/index.mjs").AnyMutableObject>;
        readonly otherDamageMatched: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly ammunitionDamageMatched: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly damageOnly: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly otherConsumed: import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>;
        readonly otherDeclined: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly otherScaling: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.AssignmentType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>;
        readonly ammunitionData: import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<{
            required: boolean;
            initial: undefined;
        }>, import("fvtt-types/src/utils/index.mjs").AnyMutableObject, import("fvtt-types/src/utils/index.mjs").AnyMutableObject>;
        readonly inCombat: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly isTurn: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly deferredConcentration: import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>;
        readonly useChanges: import("fvtt-types/src/foundry/common/data/fields.mjs").StringField<{
            readonly blank: true;
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>>;
        readonly damageMessages: import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField<import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField<{
            readonly key: /*elided*/ any;
            readonly id: /*elided*/ any;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField.Internal.AssignmentType<{
            readonly key: /*elided*/ any;
            readonly id: /*elided*/ any;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField.DefaultOptions>, {
            key: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
                readonly blank: false;
            }>>, {
                initial: undefined;
            }>>;
            id: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
                readonly blank: false;
            }>>, {
                initial: undefined;
            }>>;
        }, {
            key: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
                readonly blank: false;
            }>>, {
                initial: undefined;
            }>>;
            id: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
                readonly blank: false;
            }>>, {
                initial: undefined;
            }>>;
        }>, {
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField.Internal.AssignmentType<{
            readonly key: /*elided*/ any;
            readonly id: /*elided*/ any;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField.DefaultOptions>, {
            key: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
                readonly blank: false;
            }>>, {
                initial: undefined;
            }>>;
            id: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
                readonly blank: false;
            }>>, {
                initial: undefined;
            }>>;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField.Internal.AssignmentType<{
            readonly key: /*elided*/ any;
            readonly id: /*elided*/ any;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField.DefaultOptions>, {
            required: boolean;
            initial: undefined;
        }>, {
            key: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
                readonly blank: false;
            }>>, {
                initial: undefined;
            }>>;
            id: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
                readonly blank: false;
            }>>, {
                initial: undefined;
            }>>;
        }[], {
            key: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
                readonly blank: false;
            }>>, {
                initial: undefined;
            }>>;
            id: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
                readonly blank: false;
            }>>, {
                initial: undefined;
            }>>;
        }, {
            key: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
                readonly blank: false;
            }>>, {
                initial: undefined;
            }>>;
            id: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
                readonly blank: false;
            }>>, {
                initial: undefined;
            }>>;
        }[]>;
        readonly tagSnapshots: import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions>, import("fvtt-types/src/utils/index.mjs").AnyMutableObject, import("fvtt-types/src/utils/index.mjs").AnyMutableObject>, {
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions>, import("fvtt-types/src/utils/index.mjs").AnyMutableObject, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions>, {
            required: boolean;
            initial: undefined;
        }>, import("fvtt-types/src/utils/index.mjs").AnyMutableObject[], import("fvtt-types/src/utils/index.mjs").AnyMutableObject, import("fvtt-types/src/utils/index.mjs").AnyMutableObject[]>;
        readonly choices: import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions>, import("fvtt-types/src/utils/index.mjs").AnyMutableObject, import("fvtt-types/src/utils/index.mjs").AnyMutableObject>, {
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions>, import("fvtt-types/src/utils/index.mjs").AnyMutableObject, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions>, {
            required: boolean;
            initial: undefined;
        }>, import("fvtt-types/src/utils/index.mjs").AnyMutableObject[], import("fvtt-types/src/utils/index.mjs").AnyMutableObject, import("fvtt-types/src/utils/index.mjs").AnyMutableObject[]>;
        readonly damageRules: import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField<{
            readonly downgrade: /*elided*/ any;
            readonly ignore: /*elided*/ any;
        }, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField.Internal.AssignmentType<{
            readonly downgrade: /*elided*/ any;
            readonly ignore: /*elided*/ any;
        }, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField.Internal.InitializedType<{
            readonly downgrade: /*elided*/ any;
            readonly ignore: /*elided*/ any;
        }, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField.Internal.PersistedType<{
            readonly downgrade: /*elided*/ any;
            readonly ignore: /*elided*/ any;
        }, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>;
    }, {
        readonly required: false;
    }>, import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField.Internal.PersistedType<{
        readonly workflowClass: import("fvtt-types/src/foundry/common/data/fields.mjs").StringField<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>>;
        readonly flow: import("fvtt-types/src/foundry/common/data/fields.mjs").StringField<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>>;
        readonly step: import("fvtt-types/src/foundry/common/data/fields.mjs").StringField<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>>;
        readonly stepChanges: import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions>, import("fvtt-types/src/utils/index.mjs").AnyMutableObject, import("fvtt-types/src/utils/index.mjs").AnyMutableObject>, {
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions>, import("fvtt-types/src/utils/index.mjs").AnyMutableObject, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions>, {
            required: boolean;
            initial: undefined;
        }>, import("fvtt-types/src/utils/index.mjs").AnyMutableObject[], import("fvtt-types/src/utils/index.mjs").AnyMutableObject, import("fvtt-types/src/utils/index.mjs").AnyMutableObject[]>;
        readonly stepMove: import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>;
        readonly isCritical: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly isFumble: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly templateUuids: import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>>, {
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, {
            required: boolean;
            initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>[], import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>[]>;
        readonly workflowOptions: import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<{
            required: boolean;
            initial: undefined;
        }>, import("fvtt-types/src/utils/index.mjs").AnyMutableObject, import("fvtt-types/src/utils/index.mjs").AnyMutableObject>;
        readonly saveMults: import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<{
            required: boolean;
            initial: undefined;
        }>, import("fvtt-types/src/utils/index.mjs").AnyMutableObject, import("fvtt-types/src/utils/index.mjs").AnyMutableObject>;
        readonly otherDamageMatched: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly ammunitionDamageMatched: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly damageOnly: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly otherConsumed: import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>;
        readonly otherDeclined: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly otherScaling: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.AssignmentType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>;
        readonly ammunitionData: import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<{
            required: boolean;
            initial: undefined;
        }>, import("fvtt-types/src/utils/index.mjs").AnyMutableObject, import("fvtt-types/src/utils/index.mjs").AnyMutableObject>;
        readonly inCombat: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly isTurn: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly deferredConcentration: import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>;
        readonly useChanges: import("fvtt-types/src/foundry/common/data/fields.mjs").StringField<{
            readonly blank: true;
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>>;
        readonly damageMessages: import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField<import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField<{
            readonly key: /*elided*/ any;
            readonly id: /*elided*/ any;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField.Internal.AssignmentType<{
            readonly key: /*elided*/ any;
            readonly id: /*elided*/ any;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField.DefaultOptions>, {
            key: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
                readonly blank: false;
            }>>, {
                initial: undefined;
            }>>;
            id: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
                readonly blank: false;
            }>>, {
                initial: undefined;
            }>>;
        }, {
            key: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
                readonly blank: false;
            }>>, {
                initial: undefined;
            }>>;
            id: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
                readonly blank: false;
            }>>, {
                initial: undefined;
            }>>;
        }>, {
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField.Internal.AssignmentType<{
            readonly key: /*elided*/ any;
            readonly id: /*elided*/ any;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField.DefaultOptions>, {
            key: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
                readonly blank: false;
            }>>, {
                initial: undefined;
            }>>;
            id: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
                readonly blank: false;
            }>>, {
                initial: undefined;
            }>>;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField.Internal.AssignmentType<{
            readonly key: /*elided*/ any;
            readonly id: /*elided*/ any;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField.DefaultOptions>, {
            required: boolean;
            initial: undefined;
        }>, {
            key: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
                readonly blank: false;
            }>>, {
                initial: undefined;
            }>>;
            id: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
                readonly blank: false;
            }>>, {
                initial: undefined;
            }>>;
        }[], {
            key: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
                readonly blank: false;
            }>>, {
                initial: undefined;
            }>>;
            id: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
                readonly blank: false;
            }>>, {
                initial: undefined;
            }>>;
        }, {
            key: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
                readonly blank: false;
            }>>, {
                initial: undefined;
            }>>;
            id: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
                readonly blank: false;
            }>>, {
                initial: undefined;
            }>>;
        }[]>;
        readonly tagSnapshots: import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions>, import("fvtt-types/src/utils/index.mjs").AnyMutableObject, import("fvtt-types/src/utils/index.mjs").AnyMutableObject>, {
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions>, import("fvtt-types/src/utils/index.mjs").AnyMutableObject, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions>, {
            required: boolean;
            initial: undefined;
        }>, import("fvtt-types/src/utils/index.mjs").AnyMutableObject[], import("fvtt-types/src/utils/index.mjs").AnyMutableObject, import("fvtt-types/src/utils/index.mjs").AnyMutableObject[]>;
        readonly choices: import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions>, import("fvtt-types/src/utils/index.mjs").AnyMutableObject, import("fvtt-types/src/utils/index.mjs").AnyMutableObject>, {
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions>, import("fvtt-types/src/utils/index.mjs").AnyMutableObject, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions>, {
            required: boolean;
            initial: undefined;
        }>, import("fvtt-types/src/utils/index.mjs").AnyMutableObject[], import("fvtt-types/src/utils/index.mjs").AnyMutableObject, import("fvtt-types/src/utils/index.mjs").AnyMutableObject[]>;
        readonly damageRules: import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField<{
            readonly downgrade: /*elided*/ any;
            readonly ignore: /*elided*/ any;
        }, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField.Internal.AssignmentType<{
            readonly downgrade: /*elided*/ any;
            readonly ignore: /*elided*/ any;
        }, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField.Internal.InitializedType<{
            readonly downgrade: /*elided*/ any;
            readonly ignore: /*elided*/ any;
        }, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField.Internal.PersistedType<{
            readonly downgrade: /*elided*/ any;
            readonly ignore: /*elided*/ any;
        }, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>;
    }, {
        readonly required: false;
    }>>;
    records: import("fvtt-types/src/foundry/common/data/fields.mjs").TypedObjectField<import("fvtt-types/src/foundry/common/data/fields.mjs").TypedObjectField<import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField<{
        readonly hitShowAC: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>>;
        readonly acIcons: import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions>, import("fvtt-types/src/utils/index.mjs").AnyMutableObject, import("fvtt-types/src/utils/index.mjs").AnyMutableObject>, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions>, import("fvtt-types/src/utils/index.mjs").AnyMutableObject, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions>, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.InitializedType<import("fvtt-types/src/utils/index.mjs").AnyMutableObject, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/utils/index.mjs").AnyMutableObject, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.PersistedType<import("fvtt-types/src/utils/index.mjs").AnyMutableObject, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>;
        readonly saveTotal: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.AssignmentType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>;
        readonly saveCover: import("fvtt-types/src/foundry/common/data/fields.mjs").StringField<{
            readonly choices: readonly ["half", "threeQuarters", "total"];
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<"total" | "half" | "threeQuarters", import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptionsWhenChoicesProvided, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly choices: readonly ["half", "threeQuarters", "total"];
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<"total" | "half" | "threeQuarters", import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptionsWhenChoicesProvided, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly choices: readonly ["half", "threeQuarters", "total"];
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<"total" | "half" | "threeQuarters", import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptionsWhenChoicesProvided, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly choices: readonly ["half", "threeQuarters", "total"];
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>>;
        readonly saveCoverAuto: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly saveMode: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.AssignmentType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>;
        readonly saveAttribution: import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField<import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>>, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.DefaultOptions>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>[], import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>[]>, {
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.DefaultOptions>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>[], import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.DefaultOptions>, {
            required: boolean;
            initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>[][], import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>[], import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>[][]>;
        readonly uncannyDodge: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly uncannyDodgeIcon: import("fvtt-types/src/foundry/common/data/fields.mjs").StringField<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>>;
        readonly otherDamage: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly ammunitionDamage: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly preSelected: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.AssignmentType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>;
        readonly canSee: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly canSense: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly seesActor: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly sensesActor: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly uuid: import("fvtt-types/src/foundry/common/data/fields.mjs").StringField<{
            readonly required: true;
            readonly blank: false;
        }, string, string, string>;
    }, import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField.Internal.AssignmentType<{
        readonly hitShowAC: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>>;
        readonly acIcons: import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions>, import("fvtt-types/src/utils/index.mjs").AnyMutableObject, import("fvtt-types/src/utils/index.mjs").AnyMutableObject>, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions>, import("fvtt-types/src/utils/index.mjs").AnyMutableObject, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions>, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.InitializedType<import("fvtt-types/src/utils/index.mjs").AnyMutableObject, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/utils/index.mjs").AnyMutableObject, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.PersistedType<import("fvtt-types/src/utils/index.mjs").AnyMutableObject, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>;
        readonly saveTotal: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.AssignmentType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>;
        readonly saveCover: import("fvtt-types/src/foundry/common/data/fields.mjs").StringField<{
            readonly choices: readonly ["half", "threeQuarters", "total"];
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<"total" | "half" | "threeQuarters", import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptionsWhenChoicesProvided, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly choices: readonly ["half", "threeQuarters", "total"];
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<"total" | "half" | "threeQuarters", import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptionsWhenChoicesProvided, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly choices: readonly ["half", "threeQuarters", "total"];
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<"total" | "half" | "threeQuarters", import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptionsWhenChoicesProvided, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly choices: readonly ["half", "threeQuarters", "total"];
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>>;
        readonly saveCoverAuto: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly saveMode: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.AssignmentType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>;
        readonly saveAttribution: import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField<import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>>, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.DefaultOptions>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>[], import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>[]>, {
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.DefaultOptions>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>[], import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.DefaultOptions>, {
            required: boolean;
            initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>[][], import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>[], import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>[][]>;
        readonly uncannyDodge: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly uncannyDodgeIcon: import("fvtt-types/src/foundry/common/data/fields.mjs").StringField<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>>;
        readonly otherDamage: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly ammunitionDamage: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly preSelected: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.AssignmentType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>;
        readonly canSee: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly canSense: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly seesActor: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly sensesActor: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly uuid: import("fvtt-types/src/foundry/common/data/fields.mjs").StringField<{
            readonly required: true;
            readonly blank: false;
        }, string, string, string>;
    }, import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField.DefaultOptions>, {
        hitShowAC: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>;
        acIcons: import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.InitializedType<import("fvtt-types/src/utils/index.mjs").AnyMutableObject, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>;
        saveTotal: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>;
        saveCover: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<"total" | "half" | "threeQuarters", import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptionsWhenChoicesProvided, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly choices: readonly ["half", "threeQuarters", "total"];
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>;
        saveCoverAuto: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>;
        saveMode: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>;
        saveAttribution: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>[][];
        uncannyDodge: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>;
        uncannyDodgeIcon: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>;
        otherDamage: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>;
        ammunitionDamage: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>;
        preSelected: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>;
        canSee: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>;
        canSense: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>;
        seesActor: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>;
        sensesActor: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>;
        uuid: string;
    }, {
        hitShowAC: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>;
        acIcons: import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.PersistedType<import("fvtt-types/src/utils/index.mjs").AnyMutableObject, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>;
        saveTotal: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>;
        saveCover: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<"total" | "half" | "threeQuarters", import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptionsWhenChoicesProvided, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly choices: readonly ["half", "threeQuarters", "total"];
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>;
        saveCoverAuto: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>;
        saveMode: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>;
        saveAttribution: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>[][];
        uncannyDodge: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>;
        uncannyDodgeIcon: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>;
        otherDamage: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>;
        ammunitionDamage: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>;
        preSelected: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>;
        canSee: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>;
        canSense: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>;
        seesActor: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>;
        sensesActor: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>;
        uuid: string;
    }>, import("fvtt-types/src/foundry/common/data/fields.mjs").TypedObjectField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").TypedObjectField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField<{
        readonly hitShowAC: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>>;
        readonly acIcons: import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions>, import("fvtt-types/src/utils/index.mjs").AnyMutableObject, import("fvtt-types/src/utils/index.mjs").AnyMutableObject>, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions>, import("fvtt-types/src/utils/index.mjs").AnyMutableObject, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions>, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.InitializedType<import("fvtt-types/src/utils/index.mjs").AnyMutableObject, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/utils/index.mjs").AnyMutableObject, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.PersistedType<import("fvtt-types/src/utils/index.mjs").AnyMutableObject, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>;
        readonly saveTotal: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.AssignmentType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>;
        readonly saveCover: import("fvtt-types/src/foundry/common/data/fields.mjs").StringField<{
            readonly choices: readonly ["half", "threeQuarters", "total"];
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<"total" | "half" | "threeQuarters", import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptionsWhenChoicesProvided, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly choices: readonly ["half", "threeQuarters", "total"];
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<"total" | "half" | "threeQuarters", import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptionsWhenChoicesProvided, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly choices: readonly ["half", "threeQuarters", "total"];
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<"total" | "half" | "threeQuarters", import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptionsWhenChoicesProvided, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly choices: readonly ["half", "threeQuarters", "total"];
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>>;
        readonly saveCoverAuto: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly saveMode: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.AssignmentType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>;
        readonly saveAttribution: import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField<import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>>, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.DefaultOptions>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>[], import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>[]>, {
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.DefaultOptions>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>[], import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.DefaultOptions>, {
            required: boolean;
            initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>[][], import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>[], import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>[][]>;
        readonly uncannyDodge: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly uncannyDodgeIcon: import("fvtt-types/src/foundry/common/data/fields.mjs").StringField<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>>;
        readonly otherDamage: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly ammunitionDamage: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly preSelected: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.AssignmentType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>;
        readonly canSee: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly canSense: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly seesActor: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly sensesActor: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly uuid: import("fvtt-types/src/foundry/common/data/fields.mjs").StringField<{
            readonly required: true;
            readonly blank: false;
        }, string, string, string>;
    }, import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField.Internal.AssignmentType<{
        readonly hitShowAC: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>>;
        readonly acIcons: import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions>, import("fvtt-types/src/utils/index.mjs").AnyMutableObject, import("fvtt-types/src/utils/index.mjs").AnyMutableObject>, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions>, import("fvtt-types/src/utils/index.mjs").AnyMutableObject, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions>, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.InitializedType<import("fvtt-types/src/utils/index.mjs").AnyMutableObject, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/utils/index.mjs").AnyMutableObject, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.PersistedType<import("fvtt-types/src/utils/index.mjs").AnyMutableObject, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>;
        readonly saveTotal: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.AssignmentType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>;
        readonly saveCover: import("fvtt-types/src/foundry/common/data/fields.mjs").StringField<{
            readonly choices: readonly ["half", "threeQuarters", "total"];
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<"total" | "half" | "threeQuarters", import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptionsWhenChoicesProvided, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly choices: readonly ["half", "threeQuarters", "total"];
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<"total" | "half" | "threeQuarters", import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptionsWhenChoicesProvided, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly choices: readonly ["half", "threeQuarters", "total"];
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<"total" | "half" | "threeQuarters", import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptionsWhenChoicesProvided, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly choices: readonly ["half", "threeQuarters", "total"];
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>>;
        readonly saveCoverAuto: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly saveMode: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.AssignmentType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>;
        readonly saveAttribution: import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField<import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>>, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.DefaultOptions>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>[], import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>[]>, {
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.DefaultOptions>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>[], import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.DefaultOptions>, {
            required: boolean;
            initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>[][], import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>[], import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>[][]>;
        readonly uncannyDodge: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly uncannyDodgeIcon: import("fvtt-types/src/foundry/common/data/fields.mjs").StringField<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>>;
        readonly otherDamage: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly ammunitionDamage: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly preSelected: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.AssignmentType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>;
        readonly canSee: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly canSense: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly seesActor: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly sensesActor: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly uuid: import("fvtt-types/src/foundry/common/data/fields.mjs").StringField<{
            readonly required: true;
            readonly blank: false;
        }, string, string, string>;
    }, import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField.DefaultOptions>, {
        hitShowAC: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>;
        acIcons: import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.InitializedType<import("fvtt-types/src/utils/index.mjs").AnyMutableObject, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>;
        saveTotal: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>;
        saveCover: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<"total" | "half" | "threeQuarters", import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptionsWhenChoicesProvided, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly choices: readonly ["half", "threeQuarters", "total"];
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>;
        saveCoverAuto: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>;
        saveMode: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>;
        saveAttribution: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>[][];
        uncannyDodge: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>;
        uncannyDodgeIcon: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>;
        otherDamage: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>;
        ammunitionDamage: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>;
        preSelected: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>;
        canSee: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>;
        canSense: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>;
        seesActor: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>;
        sensesActor: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>;
        uuid: string;
    }, {
        hitShowAC: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>;
        acIcons: import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.PersistedType<import("fvtt-types/src/utils/index.mjs").AnyMutableObject, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>;
        saveTotal: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>;
        saveCover: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<"total" | "half" | "threeQuarters", import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptionsWhenChoicesProvided, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly choices: readonly ["half", "threeQuarters", "total"];
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>;
        saveCoverAuto: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>;
        saveMode: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>;
        saveAttribution: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>[][];
        uncannyDodge: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>;
        uncannyDodgeIcon: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>;
        otherDamage: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>;
        ammunitionDamage: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>;
        preSelected: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>;
        canSee: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>;
        canSense: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>;
        seesActor: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>;
        sensesActor: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>;
        uuid: string;
    }>, import("fvtt-types/src/foundry/common/data/fields.mjs").TypedObjectField.DefaultOptions>, {
        [x: string]: {
            hitShowAC: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
                readonly nullable: true;
                readonly required: boolean;
                readonly initial: undefined;
            }>>;
            acIcons: import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.InitializedType<import("fvtt-types/src/utils/index.mjs").AnyMutableObject, {
                readonly nullable: true;
                readonly required: boolean;
                readonly initial: undefined;
            }>;
            saveTotal: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
                readonly nullable: true;
                readonly required: boolean;
                readonly initial: undefined;
            }>;
            saveCover: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<"total" | "half" | "threeQuarters", import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptionsWhenChoicesProvided, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
                readonly choices: readonly ["half", "threeQuarters", "total"];
                readonly required: boolean;
                readonly initial: undefined;
            }>>, {
                initial: undefined;
            }>>;
            saveCoverAuto: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
                required: boolean;
                initial: undefined;
            }>>;
            saveMode: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
                readonly nullable: true;
                readonly required: boolean;
                readonly initial: undefined;
            }>;
            saveAttribution: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
                initial: undefined;
            }>>[][];
            uncannyDodge: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
                required: boolean;
                initial: undefined;
            }>>;
            uncannyDodgeIcon: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
                readonly blank: true;
                readonly required: boolean;
                readonly initial: undefined;
            }>>, {
                initial: undefined;
            }>>;
            otherDamage: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
                required: boolean;
                initial: undefined;
            }>>;
            ammunitionDamage: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
                required: boolean;
                initial: undefined;
            }>>;
            preSelected: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
                readonly nullable: true;
                readonly required: boolean;
                readonly initial: undefined;
            }>;
            canSee: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
                required: boolean;
                initial: undefined;
            }>>;
            canSense: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
                required: boolean;
                initial: undefined;
            }>>;
            seesActor: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
                required: boolean;
                initial: undefined;
            }>>;
            sensesActor: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
                required: boolean;
                initial: undefined;
            }>>;
            uuid: string;
        };
    }, {
        [x: string]: {
            hitShowAC: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
                readonly nullable: true;
                readonly required: boolean;
                readonly initial: undefined;
            }>>;
            acIcons: import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.InitializedType<import("fvtt-types/src/utils/index.mjs").AnyMutableObject, {
                readonly nullable: true;
                readonly required: boolean;
                readonly initial: undefined;
            }>;
            saveTotal: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
                readonly nullable: true;
                readonly required: boolean;
                readonly initial: undefined;
            }>;
            saveCover: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<"total" | "half" | "threeQuarters", import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptionsWhenChoicesProvided, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
                readonly choices: readonly ["half", "threeQuarters", "total"];
                readonly required: boolean;
                readonly initial: undefined;
            }>>, {
                initial: undefined;
            }>>;
            saveCoverAuto: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
                required: boolean;
                initial: undefined;
            }>>;
            saveMode: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
                readonly nullable: true;
                readonly required: boolean;
                readonly initial: undefined;
            }>;
            saveAttribution: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
                initial: undefined;
            }>>[][];
            uncannyDodge: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
                required: boolean;
                initial: undefined;
            }>>;
            uncannyDodgeIcon: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
                readonly blank: true;
                readonly required: boolean;
                readonly initial: undefined;
            }>>, {
                initial: undefined;
            }>>;
            otherDamage: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
                required: boolean;
                initial: undefined;
            }>>;
            ammunitionDamage: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
                required: boolean;
                initial: undefined;
            }>>;
            preSelected: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
                readonly nullable: true;
                readonly required: boolean;
                readonly initial: undefined;
            }>;
            canSee: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
                required: boolean;
                initial: undefined;
            }>>;
            canSense: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
                required: boolean;
                initial: undefined;
            }>>;
            seesActor: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
                required: boolean;
                initial: undefined;
            }>>;
            sensesActor: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
                required: boolean;
                initial: undefined;
            }>>;
            uuid: string;
        };
    }>, {
        readonly required: false;
    }, import("fvtt-types/src/foundry/common/data/fields.mjs").TypedObjectField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").TypedObjectField<import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField<{
        readonly hitShowAC: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>>;
        readonly acIcons: import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions>, import("fvtt-types/src/utils/index.mjs").AnyMutableObject, import("fvtt-types/src/utils/index.mjs").AnyMutableObject>, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions>, import("fvtt-types/src/utils/index.mjs").AnyMutableObject, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions>, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.InitializedType<import("fvtt-types/src/utils/index.mjs").AnyMutableObject, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/utils/index.mjs").AnyMutableObject, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.PersistedType<import("fvtt-types/src/utils/index.mjs").AnyMutableObject, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>;
        readonly saveTotal: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.AssignmentType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>;
        readonly saveCover: import("fvtt-types/src/foundry/common/data/fields.mjs").StringField<{
            readonly choices: readonly ["half", "threeQuarters", "total"];
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<"total" | "half" | "threeQuarters", import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptionsWhenChoicesProvided, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly choices: readonly ["half", "threeQuarters", "total"];
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<"total" | "half" | "threeQuarters", import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptionsWhenChoicesProvided, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly choices: readonly ["half", "threeQuarters", "total"];
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<"total" | "half" | "threeQuarters", import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptionsWhenChoicesProvided, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly choices: readonly ["half", "threeQuarters", "total"];
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>>;
        readonly saveCoverAuto: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly saveMode: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.AssignmentType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>;
        readonly saveAttribution: import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField<import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>>, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.DefaultOptions>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>[], import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>[]>, {
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.DefaultOptions>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>[], import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.DefaultOptions>, {
            required: boolean;
            initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>[][], import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>[], import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>[][]>;
        readonly uncannyDodge: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly uncannyDodgeIcon: import("fvtt-types/src/foundry/common/data/fields.mjs").StringField<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>>;
        readonly otherDamage: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly ammunitionDamage: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly preSelected: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.AssignmentType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>;
        readonly canSee: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly canSense: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly seesActor: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly sensesActor: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly uuid: import("fvtt-types/src/foundry/common/data/fields.mjs").StringField<{
            readonly required: true;
            readonly blank: false;
        }, string, string, string>;
    }, import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField.Internal.AssignmentType<{
        readonly hitShowAC: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>>;
        readonly acIcons: import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions>, import("fvtt-types/src/utils/index.mjs").AnyMutableObject, import("fvtt-types/src/utils/index.mjs").AnyMutableObject>, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions>, import("fvtt-types/src/utils/index.mjs").AnyMutableObject, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions>, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.InitializedType<import("fvtt-types/src/utils/index.mjs").AnyMutableObject, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/utils/index.mjs").AnyMutableObject, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.PersistedType<import("fvtt-types/src/utils/index.mjs").AnyMutableObject, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>;
        readonly saveTotal: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.AssignmentType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>;
        readonly saveCover: import("fvtt-types/src/foundry/common/data/fields.mjs").StringField<{
            readonly choices: readonly ["half", "threeQuarters", "total"];
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<"total" | "half" | "threeQuarters", import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptionsWhenChoicesProvided, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly choices: readonly ["half", "threeQuarters", "total"];
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<"total" | "half" | "threeQuarters", import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptionsWhenChoicesProvided, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly choices: readonly ["half", "threeQuarters", "total"];
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<"total" | "half" | "threeQuarters", import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptionsWhenChoicesProvided, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly choices: readonly ["half", "threeQuarters", "total"];
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>>;
        readonly saveCoverAuto: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly saveMode: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.AssignmentType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>;
        readonly saveAttribution: import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField<import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>>, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.DefaultOptions>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>[], import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>[]>, {
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.DefaultOptions>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>[], import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.DefaultOptions>, {
            required: boolean;
            initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>[][], import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>[], import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>[][]>;
        readonly uncannyDodge: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly uncannyDodgeIcon: import("fvtt-types/src/foundry/common/data/fields.mjs").StringField<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>>;
        readonly otherDamage: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly ammunitionDamage: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly preSelected: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.AssignmentType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>;
        readonly canSee: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly canSense: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly seesActor: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly sensesActor: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly uuid: import("fvtt-types/src/foundry/common/data/fields.mjs").StringField<{
            readonly required: true;
            readonly blank: false;
        }, string, string, string>;
    }, import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField.DefaultOptions>, {
        hitShowAC: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>;
        acIcons: import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.InitializedType<import("fvtt-types/src/utils/index.mjs").AnyMutableObject, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>;
        saveTotal: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>;
        saveCover: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<"total" | "half" | "threeQuarters", import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptionsWhenChoicesProvided, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly choices: readonly ["half", "threeQuarters", "total"];
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>;
        saveCoverAuto: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>;
        saveMode: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>;
        saveAttribution: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>[][];
        uncannyDodge: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>;
        uncannyDodgeIcon: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>;
        otherDamage: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>;
        ammunitionDamage: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>;
        preSelected: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>;
        canSee: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>;
        canSense: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>;
        seesActor: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>;
        sensesActor: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>;
        uuid: string;
    }, {
        hitShowAC: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>;
        acIcons: import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.PersistedType<import("fvtt-types/src/utils/index.mjs").AnyMutableObject, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>;
        saveTotal: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>;
        saveCover: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<"total" | "half" | "threeQuarters", import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptionsWhenChoicesProvided, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly choices: readonly ["half", "threeQuarters", "total"];
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>;
        saveCoverAuto: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>;
        saveMode: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>;
        saveAttribution: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>[][];
        uncannyDodge: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>;
        uncannyDodgeIcon: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>;
        otherDamage: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>;
        ammunitionDamage: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>;
        preSelected: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>;
        canSee: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>;
        canSense: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>;
        seesActor: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>;
        sensesActor: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>;
        uuid: string;
    }>, import("fvtt-types/src/foundry/common/data/fields.mjs").TypedObjectField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").TypedObjectField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField<{
        readonly hitShowAC: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>>;
        readonly acIcons: import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions>, import("fvtt-types/src/utils/index.mjs").AnyMutableObject, import("fvtt-types/src/utils/index.mjs").AnyMutableObject>, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions>, import("fvtt-types/src/utils/index.mjs").AnyMutableObject, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions>, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.InitializedType<import("fvtt-types/src/utils/index.mjs").AnyMutableObject, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/utils/index.mjs").AnyMutableObject, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.PersistedType<import("fvtt-types/src/utils/index.mjs").AnyMutableObject, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>;
        readonly saveTotal: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.AssignmentType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>;
        readonly saveCover: import("fvtt-types/src/foundry/common/data/fields.mjs").StringField<{
            readonly choices: readonly ["half", "threeQuarters", "total"];
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<"total" | "half" | "threeQuarters", import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptionsWhenChoicesProvided, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly choices: readonly ["half", "threeQuarters", "total"];
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<"total" | "half" | "threeQuarters", import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptionsWhenChoicesProvided, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly choices: readonly ["half", "threeQuarters", "total"];
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<"total" | "half" | "threeQuarters", import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptionsWhenChoicesProvided, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly choices: readonly ["half", "threeQuarters", "total"];
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>>;
        readonly saveCoverAuto: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly saveMode: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.AssignmentType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>;
        readonly saveAttribution: import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField<import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>>, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.DefaultOptions>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>[], import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>[]>, {
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.DefaultOptions>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>[], import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.DefaultOptions>, {
            required: boolean;
            initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>[][], import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>[], import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>[][]>;
        readonly uncannyDodge: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly uncannyDodgeIcon: import("fvtt-types/src/foundry/common/data/fields.mjs").StringField<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>>;
        readonly otherDamage: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly ammunitionDamage: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly preSelected: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.AssignmentType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>;
        readonly canSee: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly canSense: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly seesActor: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly sensesActor: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly uuid: import("fvtt-types/src/foundry/common/data/fields.mjs").StringField<{
            readonly required: true;
            readonly blank: false;
        }, string, string, string>;
    }, import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField.Internal.AssignmentType<{
        readonly hitShowAC: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>>;
        readonly acIcons: import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions>, import("fvtt-types/src/utils/index.mjs").AnyMutableObject, import("fvtt-types/src/utils/index.mjs").AnyMutableObject>, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions>, import("fvtt-types/src/utils/index.mjs").AnyMutableObject, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ObjectField.DefaultOptions>, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.InitializedType<import("fvtt-types/src/utils/index.mjs").AnyMutableObject, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/utils/index.mjs").AnyMutableObject, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.PersistedType<import("fvtt-types/src/utils/index.mjs").AnyMutableObject, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>;
        readonly saveTotal: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.AssignmentType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>;
        readonly saveCover: import("fvtt-types/src/foundry/common/data/fields.mjs").StringField<{
            readonly choices: readonly ["half", "threeQuarters", "total"];
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<"total" | "half" | "threeQuarters", import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptionsWhenChoicesProvided, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly choices: readonly ["half", "threeQuarters", "total"];
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<"total" | "half" | "threeQuarters", import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptionsWhenChoicesProvided, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly choices: readonly ["half", "threeQuarters", "total"];
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<"total" | "half" | "threeQuarters", import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptionsWhenChoicesProvided, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly choices: readonly ["half", "threeQuarters", "total"];
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>>;
        readonly saveCoverAuto: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly saveMode: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.AssignmentType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>;
        readonly saveAttribution: import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField<import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>>, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.DefaultOptions>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>[], import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>[]>, {
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.DefaultOptions>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>[], import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.DefaultOptions>, {
            required: boolean;
            initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>[][], import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>[], import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>[][]>;
        readonly uncannyDodge: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly uncannyDodgeIcon: import("fvtt-types/src/foundry/common/data/fields.mjs").StringField<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>>;
        readonly otherDamage: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly ammunitionDamage: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly preSelected: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.AssignmentType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>;
        readonly canSee: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly canSense: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly seesActor: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly sensesActor: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            required: boolean;
            initial: undefined;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>>;
        readonly uuid: import("fvtt-types/src/foundry/common/data/fields.mjs").StringField<{
            readonly required: true;
            readonly blank: false;
        }, string, string, string>;
    }, import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField.DefaultOptions>, {
        hitShowAC: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>;
        acIcons: import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.InitializedType<import("fvtt-types/src/utils/index.mjs").AnyMutableObject, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>;
        saveTotal: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>;
        saveCover: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<"total" | "half" | "threeQuarters", import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptionsWhenChoicesProvided, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly choices: readonly ["half", "threeQuarters", "total"];
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>;
        saveCoverAuto: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>;
        saveMode: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>;
        saveAttribution: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>[][];
        uncannyDodge: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>;
        uncannyDodgeIcon: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>;
        otherDamage: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>;
        ammunitionDamage: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>;
        preSelected: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>;
        canSee: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>;
        canSense: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>;
        seesActor: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>;
        sensesActor: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>;
        uuid: string;
    }, {
        hitShowAC: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>;
        acIcons: import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.PersistedType<import("fvtt-types/src/utils/index.mjs").AnyMutableObject, {
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>;
        saveTotal: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>;
        saveCover: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<"total" | "half" | "threeQuarters", import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptionsWhenChoicesProvided, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly choices: readonly ["half", "threeQuarters", "total"];
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>;
        saveCoverAuto: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>;
        saveMode: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>;
        saveAttribution: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
            initial: undefined;
        }>>[][];
        uncannyDodge: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>;
        uncannyDodgeIcon: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly blank: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>>, {
            initial: undefined;
        }>>;
        otherDamage: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>;
        ammunitionDamage: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>;
        preSelected: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly nullable: true;
            readonly required: boolean;
            readonly initial: undefined;
        }>;
        canSee: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>;
        canSense: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>;
        seesActor: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>;
        sensesActor: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            required: boolean;
            initial: undefined;
        }>>;
        uuid: string;
    }>, import("fvtt-types/src/foundry/common/data/fields.mjs").TypedObjectField.DefaultOptions>, {
        [x: string]: {
            hitShowAC: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
                readonly nullable: true;
                readonly required: boolean;
                readonly initial: undefined;
            }>>;
            acIcons: import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.InitializedType<import("fvtt-types/src/utils/index.mjs").AnyMutableObject, {
                readonly nullable: true;
                readonly required: boolean;
                readonly initial: undefined;
            }>;
            saveTotal: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
                readonly nullable: true;
                readonly required: boolean;
                readonly initial: undefined;
            }>;
            saveCover: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<"total" | "half" | "threeQuarters", import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptionsWhenChoicesProvided, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
                readonly choices: readonly ["half", "threeQuarters", "total"];
                readonly required: boolean;
                readonly initial: undefined;
            }>>, {
                initial: undefined;
            }>>;
            saveCoverAuto: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
                required: boolean;
                initial: undefined;
            }>>;
            saveMode: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
                readonly nullable: true;
                readonly required: boolean;
                readonly initial: undefined;
            }>;
            saveAttribution: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
                initial: undefined;
            }>>[][];
            uncannyDodge: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
                required: boolean;
                initial: undefined;
            }>>;
            uncannyDodgeIcon: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
                readonly blank: true;
                readonly required: boolean;
                readonly initial: undefined;
            }>>, {
                initial: undefined;
            }>>;
            otherDamage: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
                required: boolean;
                initial: undefined;
            }>>;
            ammunitionDamage: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
                required: boolean;
                initial: undefined;
            }>>;
            preSelected: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
                readonly nullable: true;
                readonly required: boolean;
                readonly initial: undefined;
            }>;
            canSee: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
                required: boolean;
                initial: undefined;
            }>>;
            canSense: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
                required: boolean;
                initial: undefined;
            }>>;
            seesActor: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
                required: boolean;
                initial: undefined;
            }>>;
            sensesActor: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
                required: boolean;
                initial: undefined;
            }>>;
            uuid: string;
        };
    }, {
        [x: string]: {
            hitShowAC: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
                readonly nullable: true;
                readonly required: boolean;
                readonly initial: undefined;
            }>>;
            acIcons: import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.InitializedType<import("fvtt-types/src/utils/index.mjs").AnyMutableObject, {
                readonly nullable: true;
                readonly required: boolean;
                readonly initial: undefined;
            }>;
            saveTotal: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
                readonly nullable: true;
                readonly required: boolean;
                readonly initial: undefined;
            }>;
            saveCover: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<"total" | "half" | "threeQuarters", import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptionsWhenChoicesProvided, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
                readonly choices: readonly ["half", "threeQuarters", "total"];
                readonly required: boolean;
                readonly initial: undefined;
            }>>, {
                initial: undefined;
            }>>;
            saveCoverAuto: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
                required: boolean;
                initial: undefined;
            }>>;
            saveMode: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
                readonly nullable: true;
                readonly required: boolean;
                readonly initial: undefined;
            }>;
            saveAttribution: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
                initial: undefined;
            }>>[][];
            uncannyDodge: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
                required: boolean;
                initial: undefined;
            }>>;
            uncannyDodgeIcon: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
                readonly blank: true;
                readonly required: boolean;
                readonly initial: undefined;
            }>>, {
                initial: undefined;
            }>>;
            otherDamage: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
                required: boolean;
                initial: undefined;
            }>>;
            ammunitionDamage: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
                required: boolean;
                initial: undefined;
            }>>;
            preSelected: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
                readonly nullable: true;
                readonly required: boolean;
                readonly initial: undefined;
            }>;
            canSee: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
                required: boolean;
                initial: undefined;
            }>>;
            canSense: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
                required: boolean;
                initial: undefined;
            }>>;
            seesActor: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
                required: boolean;
                initial: undefined;
            }>>;
            sensesActor: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
                required: boolean;
                initial: undefined;
            }>>;
            uuid: string;
        };
    }>, {
        readonly required: false;
    }>, {
        [x: string]: {
            [x: string]: {
                hitShowAC: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
                    readonly nullable: true;
                    readonly required: boolean;
                    readonly initial: undefined;
                }>>;
                acIcons: import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.InitializedType<import("fvtt-types/src/utils/index.mjs").AnyMutableObject, {
                    readonly nullable: true;
                    readonly required: boolean;
                    readonly initial: undefined;
                }>;
                saveTotal: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
                    readonly nullable: true;
                    readonly required: boolean;
                    readonly initial: undefined;
                }>;
                saveCover: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<"total" | "half" | "threeQuarters", import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptionsWhenChoicesProvided, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
                    readonly choices: readonly ["half", "threeQuarters", "total"];
                    readonly required: boolean;
                    readonly initial: undefined;
                }>>, {
                    initial: undefined;
                }>>;
                saveCoverAuto: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
                    required: boolean;
                    initial: undefined;
                }>>;
                saveMode: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
                    readonly nullable: true;
                    readonly required: boolean;
                    readonly initial: undefined;
                }>;
                saveAttribution: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
                    initial: undefined;
                }>>[][];
                uncannyDodge: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
                    required: boolean;
                    initial: undefined;
                }>>;
                uncannyDodgeIcon: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
                    readonly blank: true;
                    readonly required: boolean;
                    readonly initial: undefined;
                }>>, {
                    initial: undefined;
                }>>;
                otherDamage: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
                    required: boolean;
                    initial: undefined;
                }>>;
                ammunitionDamage: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
                    required: boolean;
                    initial: undefined;
                }>>;
                preSelected: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
                    readonly nullable: true;
                    readonly required: boolean;
                    readonly initial: undefined;
                }>;
                canSee: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
                    required: boolean;
                    initial: undefined;
                }>>;
                canSense: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
                    required: boolean;
                    initial: undefined;
                }>>;
                seesActor: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
                    required: boolean;
                    initial: undefined;
                }>>;
                sensesActor: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
                    required: boolean;
                    initial: undefined;
                }>>;
                uuid: string;
            };
        };
    }, {
        [x: string]: {
            [x: string]: {
                hitShowAC: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
                    readonly nullable: true;
                    readonly required: boolean;
                    readonly initial: undefined;
                }>>;
                acIcons: import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.InitializedType<import("fvtt-types/src/utils/index.mjs").AnyMutableObject, {
                    readonly nullable: true;
                    readonly required: boolean;
                    readonly initial: undefined;
                }>;
                saveTotal: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
                    readonly nullable: true;
                    readonly required: boolean;
                    readonly initial: undefined;
                }>;
                saveCover: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<"total" | "half" | "threeQuarters", import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptionsWhenChoicesProvided, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
                    readonly choices: readonly ["half", "threeQuarters", "total"];
                    readonly required: boolean;
                    readonly initial: undefined;
                }>>, {
                    initial: undefined;
                }>>;
                saveCoverAuto: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
                    required: boolean;
                    initial: undefined;
                }>>;
                saveMode: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
                    readonly nullable: true;
                    readonly required: boolean;
                    readonly initial: undefined;
                }>;
                saveAttribution: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
                    initial: undefined;
                }>>[][];
                uncannyDodge: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
                    required: boolean;
                    initial: undefined;
                }>>;
                uncannyDodgeIcon: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
                    readonly blank: true;
                    readonly required: boolean;
                    readonly initial: undefined;
                }>>, {
                    initial: undefined;
                }>>;
                otherDamage: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
                    required: boolean;
                    initial: undefined;
                }>>;
                ammunitionDamage: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
                    required: boolean;
                    initial: undefined;
                }>>;
                preSelected: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
                    readonly nullable: true;
                    readonly required: boolean;
                    readonly initial: undefined;
                }>;
                canSee: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
                    required: boolean;
                    initial: undefined;
                }>>;
                canSense: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
                    required: boolean;
                    initial: undefined;
                }>>;
                seesActor: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
                    required: boolean;
                    initial: undefined;
                }>>;
                sensesActor: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
                    required: boolean;
                    initial: undefined;
                }>>;
                uuid: string;
            };
        };
    }>;
};
/** A card's records: by scene id, then token id */
export type CardRecords = Record<string, Record<string, CardRecord>>;
/** Where a token's record is written: `system.midi.records.<sceneId>.<tokenId>` */
export declare function recordPath(document: TokenDocument.Implementation): string | undefined;
/** The record path of a token by its uuid (`Scene.<id>.Token.<id>`), for a token that may be gone */
export declare function recordPathOfUuid(tokenUuid: string): string | undefined;
/** Every record on a card */
export declare function recordList(records: CardRecords | undefined): CardRecord[];
/** The record of the token with this uuid */
export declare function recordFor(records: CardRecords | undefined, tokenUuid: string): CardRecord | undefined;
/**
 * The other activity's consumption on a card: what it consumed, false when declined or skipped, undefined until settled;
 * and the scaling it was used at. Cards before 14.6.9 kept them as `flags.midi-qol.use.consumed`/`use.otherScaling`.
 */
export declare function cardOtherConsumption(message: ChatMessage.Implementation | undefined | null): {
    consumed?: object | false;
    scaling?: number;
};
/** The damage tray's matches: token uuids the other activity's (or the ammunition's) damage applies to; undefined until worked out */
export declare function cardDamageMatches(midi: {
    state?: Record<string, any>;
    records?: CardRecords;
} | undefined, kind: "otherDamage" | "ammunitionDamage"): string[] | undefined;
/** The tokens targeted before the use, in order */
export declare function cardPreSelected(records: CardRecords | undefined): string[];
/** A card's stored workflow state and records, if it has any */
export declare function cardMidiState(message: ChatMessage.Implementation | undefined): {
    state: Record<string, any>;
    records: CardRecords;
} | undefined;
/** The type midi tags a roll with (`options.midi-qol.rollType`): attack, defaultDamage, bonusDamage, otherDamage, utility, save */
export declare function rollTypeOf(roll: unknown): string | undefined;
/** The rolls tagged with one of `types` */
export declare function rollsOfType(rolls: readonly Roll[] | undefined, types: string | readonly string[]): Roll[];
/** midi's damage messages of a use card (M13): its own contributions' and other workflows' (D2), by stored origin */
export declare function cardDamageMessages(card: ChatMessage.Implementation | null | undefined): ChatMessage.Implementation[];
/**
 * A use card's damage rolls of `types` (M13 stage 3): its damage messages' rolls. A type none of its own messages holds
 * comes from the card's rolls: a card from before them, or damage not in a message yet. `drawn`: what the card draws;
 * with dnd5e's chat card summaries off the messages show in the log themselves and the card draws none of their damage
 * (user, M13 D1 b; drawing them always is option a).
 */
export declare function cardDamageRolls(card: ChatMessage.Implementation | null | undefined, types: string | readonly string[], options?: {
    drawn?: boolean;
}): Roll[];
/** A card's attack roll, found by its tag rather than by position */
export declare function attackRollOf(message: {
    rolls?: readonly Roll[];
} | undefined): Roll | undefined;
/** midi's data on a usage card (`system.midi`, UsageCardMessage's schema): the workflow's state and records (cardStateSchema) */
export type CardMidi = {
    state?: Record<string, any>;
    records?: CardRecords;
    sections?: Record<string, MidiCardSection | null>;
    progress?: Record<string, boolean>;
    hasAttack?: boolean;
    hasDamage?: boolean;
    hasEffects?: boolean;
    condensed?: boolean;
    mergeCardMulti?: boolean;
    confirmAttackDamage?: boolean;
    hideItemDetails?: boolean;
    displayProperties?: boolean;
    dmgBtnText?: string;
    attackBtnText?: string;
    followUps?: {
        activityUuid: string;
        label?: string;
        targetUuids: string[];
        critical: boolean;
        used: boolean;
    }[];
    attackRollCount?: number;
    damageRollCount?: number;
};
/** A card's `system.midi`, empty for a message without it */
export declare function cardMidi(message: ChatMessage.Implementation | null | undefined): CardMidi;
/**
 * midi's per-target detail for the damage tray's calculation (options.midi), from the card's records and state; older
 * cards held it on dnd5e's `system.targets` entries.
 */
export declare function cardTargetDetail(message: ChatMessage.Implementation | undefined, tokenUuid: string, descriptor?: Record<string, any>): Record<string, unknown>;
/**
 * Whether the attack on a card hit (the result players see on a masked card): with hits checked, any target hit;
 * otherwise the attack roll's own result against its target. Older cards stored it as `flags.midi-qol.isHit`.
 */
export declare function cardHitResult(message: ChatMessage.Implementation | undefined): boolean | undefined;
/** Its attack is rolled and the hits are checked but not yet worked out: the old flag GMOnlyAttackRoll (shown to the GM only meanwhile) */
export declare function cardHitsPending(message: ChatMessage.Implementation | undefined, autoCheckHit: string): boolean;
/** The actor that used a card's activity: its own actor (dnd5e's), or the one a card stored (a damage-only workflow's) */
export declare function cardSourceActor(message: ChatMessage.Implementation | undefined): Actor.Implementation | undefined;
/** A flag the card stores, read past the deprecated flag getters (which warn and read the workflow) */
export declare function storedMidiFlag(message: ChatMessage.Implementation | undefined, key: string): any;
/** Attribution as [type, source, name] triples (a source can contain dots, which an update would split) */
export declare function attributionTriples(map: Record<string, Record<string, string>> | undefined): string[][];
export declare function attributionMap(triples: string[][] | undefined): Record<string, Record<string, string>>;
/**
 * The messages linked to message `id` by their `system.origin` (of `type`, if given), from dnd5e's message registry.
 * The registry keeps a message under an origin it was later moved from, so each one's origin is checked.
 */
export declare function messagesFrom(id: string, type?: string): ChatMessage.Implementation[];
