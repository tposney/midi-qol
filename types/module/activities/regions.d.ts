import { MidiActivity } from "./midiActivity.js";
import { Workflow } from "../Workflow.js";
/**
 * Apply optional region update + region behavior creation. GMs run locally; non-GMs send
 * a single batched socket call. We gate on isGM because RegionDocument#canUserModify can
 * report "update" permission for the player who just placed the template (Foundry grants
 * owner perms to the creator), but creating embedded RegionBehaviors requires scene-level
 * write which only GMs have — checking update perms gives a false positive there.
 */
export declare function writeRegion(regionDoc: any, ops: {
    update?: Record<string, any>;
    behaviors?: any[];
}): Promise<any>;
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
