import { Activity, RollDialogConfig, RollMessageConfig, RollProcessConfig } from "../../globals.js";
import { Workflow } from "../Workflow.js";
export declare let MidiUtilityActivity: ReturnType<typeof defineMidiUtilityActivityClass>;
export declare let MidiUtilitySheet: ReturnType<typeof defineMidiUtilitySheetClass>;
export declare function setupUtilityActivity(): void;
declare let defineMidiUtilityActivityClass: <T extends Activity>(ActivityClass: T) => {
    new (): {
        [x: string]: any;
        rollFormula(config: RollProcessConfig, dialog: RollDialogConfig, message: RollMessageConfig): Promise<Roll<import("fvtt-types/src/utils/index.mjs").EmptyObject>[] | undefined>;
        _midiUsageContext(message: any): Promise<import("../../globals.js").MidiUsageChatContext>;
        doConfirmation(actionToCall: string, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation): Promise<void>;
        _preCreate(data: any): void;
        prepareData(): void;
        useAs(actor: Actor.Implementation | null | undefined, usage?: import("fvtt-types/src/utils/index.mjs").InexactPartial<{
            create: {
                measuredTemplate?: boolean;
            };
            concentration: {
                begin: boolean;
                end: string | null;
            };
            consume: {
                action: boolean;
                resources: boolean | number[];
                spellSlot: boolean;
            };
            event: Event;
            scaling: false | number;
            spell: {
                slot: string;
            };
            subsequentActions?: boolean;
            cause: {
                activity: string;
                resources: boolean | number[];
            };
            workflow: Workflow;
            midiOptions: import("../utils.js").MidiOptions;
            advantage: boolean;
            disadvantage: boolean;
            midi: {
                workflowClass: typeof Workflow;
            };
            useRelaunch: {
                relaunched?: boolean;
                useKey?: string;
            };
            sequenceId: string;
            activity: Activity;
        }>, dialog?: RollDialogConfig, message?: RollMessageConfig): any;
        use(usage?: import("fvtt-types/src/utils/index.mjs").InexactPartial<{
            create: {
                measuredTemplate?: boolean;
            };
            concentration: {
                begin: boolean;
                end: string | null;
            };
            consume: {
                action: boolean;
                resources: boolean | number[];
                spellSlot: boolean;
            };
            event: Event;
            scaling: false | number;
            spell: {
                slot: string;
            };
            subsequentActions?: boolean;
            cause: {
                activity: string;
                resources: boolean | number[];
            };
            workflow: Workflow;
            midiOptions: import("../utils.js").MidiOptions;
            advantage: boolean;
            disadvantage: boolean;
            midi: {
                workflowClass: typeof Workflow;
            };
            useRelaunch: {
                relaunched?: boolean;
                useKey?: string;
            };
            sequenceId: string;
            activity: Activity;
        }>, dialog?: RollDialogConfig, message?: RollMessageConfig): any;
        hasConsumption(): boolean;
        shouldAutoConsume(workflow?: Workflow): boolean;
        checkAutoConsume(usage: import("../../globals.js").ActivityUseConfiguration, dialog?: RollDialogConfig): Promise<boolean>;
        rollDamage(config: RollProcessConfig, dialog?: RollDialogConfig, message?: RollMessageConfig): Promise<any>;
        _midiRollDamage(config: RollProcessConfig, dialog?: RollDialogConfig, message?: RollMessageConfig): Promise<any>;
        deferOtherDamage(config: RollProcessConfig, dialog: RollDialogConfig): boolean;
        rollOtherDamage(config: RollProcessConfig, dialog: RollDialogConfig): Promise<Roll[] | undefined>;
        _rollOtherDamageSource(source: {
            [x: string]: any;
            doConfirmation(actionToCall: string, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation): Promise<void>;
            _preCreate(data: any): void;
            prepareData(): void;
            useAs(actor: Actor.Implementation | null | undefined, usage?: import("fvtt-types/src/utils/index.mjs").InexactPartial<{
                create: {
                    measuredTemplate?: boolean;
                };
                concentration: {
                    begin: boolean;
                    end: string | null;
                };
                consume: {
                    action: boolean;
                    resources: boolean | number[];
                    spellSlot: boolean;
                };
                event: Event;
                scaling: false | number;
                spell: {
                    slot: string;
                };
                subsequentActions?: boolean;
                cause: {
                    activity: string;
                    resources: boolean | number[];
                };
                workflow: Workflow;
                midiOptions: import("../utils.js").MidiOptions;
                advantage: boolean;
                disadvantage: boolean;
                midi: {
                    workflowClass: typeof Workflow;
                };
                useRelaunch: {
                    relaunched?: boolean;
                    useKey?: string;
                };
                sequenceId: string;
                activity: Activity;
            }>, dialog?: RollDialogConfig, message?: RollMessageConfig): any;
            use(usage?: import("fvtt-types/src/utils/index.mjs").InexactPartial<{
                create: {
                    measuredTemplate?: boolean;
                };
                concentration: {
                    begin: boolean;
                    end: string | null;
                };
                consume: {
                    action: boolean;
                    resources: boolean | number[];
                    spellSlot: boolean;
                };
                event: Event;
                scaling: false | number;
                spell: {
                    slot: string;
                };
                subsequentActions?: boolean;
                cause: {
                    activity: string;
                    resources: boolean | number[];
                };
                workflow: Workflow;
                midiOptions: import("../utils.js").MidiOptions;
                advantage: boolean;
                disadvantage: boolean;
                midi: {
                    workflowClass: typeof Workflow;
                };
                useRelaunch: {
                    relaunched?: boolean;
                    useKey?: string;
                };
                sequenceId: string;
                activity: Activity;
            }>, dialog?: RollDialogConfig, message?: RollMessageConfig): any;
            hasConsumption(): boolean;
            shouldAutoConsume(workflow?: Workflow): boolean;
            checkAutoConsume(usage: import("fvtt-types/src/utils/index.mjs").InexactPartial<{
                create: {
                    measuredTemplate?: boolean;
                };
                concentration: {
                    begin: boolean;
                    end: string | null;
                };
                consume: {
                    action: boolean;
                    resources: boolean | number[];
                    spellSlot: boolean;
                };
                event: Event;
                scaling: false | number;
                spell: {
                    slot: string;
                };
                subsequentActions?: boolean;
                cause: {
                    activity: string;
                    resources: boolean | number[];
                };
                workflow: Workflow;
                midiOptions: import("../utils.js").MidiOptions;
                advantage: boolean;
                disadvantage: boolean;
                midi: {
                    workflowClass: typeof Workflow;
                };
                useRelaunch: {
                    relaunched?: boolean;
                    useKey?: string;
                };
                sequenceId: string;
                activity: Activity;
            }>, dialog?: RollDialogConfig): Promise<boolean>;
            rollDamage(config: RollProcessConfig, dialog?: RollDialogConfig, message?: RollMessageConfig): Promise<any>;
            _midiRollDamage(config: RollProcessConfig, dialog?: RollDialogConfig, message?: RollMessageConfig): Promise<any>;
            deferOtherDamage(config: RollProcessConfig, dialog: RollDialogConfig): boolean;
            rollOtherDamage(config: RollProcessConfig, dialog: RollDialogConfig): Promise<Roll[] | undefined>;
            _rollOtherDamageSource(source: /*elided*/ any, isAmmunition: boolean, otherConfig: RollProcessConfig, dialog: RollDialogConfig, config: RollProcessConfig): Promise<Roll[] | undefined>;
            configureDamageRoll(config: RollProcessConfig): void;
            getDamageConfig(config?: RollProcessConfig): any;
            getDamageRollModifiers(roll: Roll): string[];
            createDamageRollModifiers(this: Activity, rollConfig: RollProcessConfig): void;
            postProcessDamageRoll(config: RollProcessConfig, result: Array<Roll>): Promise<Array<Roll>>;
            setupCanSeeSense(usage: {
                workflow?: Workflow;
            }): Promise<void>;
            setupTargets(config: import("fvtt-types/src/utils/index.mjs").InexactPartial<{
                create: {
                    measuredTemplate?: boolean;
                };
                concentration: {
                    begin: boolean;
                    end: string | null;
                };
                consume: {
                    action: boolean;
                    resources: boolean | number[];
                    spellSlot: boolean;
                };
                event: Event;
                scaling: false | number;
                spell: {
                    slot: string;
                };
                subsequentActions?: boolean;
                cause: {
                    activity: string;
                    resources: boolean | number[];
                };
                workflow: Workflow;
                midiOptions: import("../utils.js").MidiOptions;
                advantage: boolean;
                disadvantage: boolean;
                midi: {
                    workflowClass: typeof Workflow;
                };
                useRelaunch: {
                    relaunched?: boolean;
                    useKey?: string;
                };
                sequenceId: string;
                activity: Activity;
            }>, dialog: RollDialogConfig, message: RollMessageConfig): Promise<boolean>;
            confirmTargets(): Promise<void>;
            preTargetingChecks(usage: import("fvtt-types/src/utils/index.mjs").InexactPartial<{
                create: {
                    measuredTemplate?: boolean;
                };
                concentration: {
                    begin: boolean;
                    end: string | null;
                };
                consume: {
                    action: boolean;
                    resources: boolean | number[];
                    spellSlot: boolean;
                };
                event: Event;
                scaling: false | number;
                spell: {
                    slot: string;
                };
                subsequentActions?: boolean;
                cause: {
                    activity: string;
                    resources: boolean | number[];
                };
                workflow: Workflow;
                midiOptions: import("../utils.js").MidiOptions;
                advantage: boolean;
                disadvantage: boolean;
                midi: {
                    workflowClass: typeof Workflow;
                };
                useRelaunch: {
                    relaunched?: boolean;
                    useKey?: string;
                };
                sequenceId: string;
                activity: Activity;
            }>, dialog: RollDialogConfig, message: RollMessageConfig, optionsConfig?: any): Promise<boolean>;
            preChatChecks(usage: import("fvtt-types/src/utils/index.mjs").InexactPartial<{
                create: {
                    measuredTemplate?: boolean;
                };
                concentration: {
                    begin: boolean;
                    end: string | null;
                };
                consume: {
                    action: boolean;
                    resources: boolean | number[];
                    spellSlot: boolean;
                };
                event: Event;
                scaling: false | number;
                spell: {
                    slot: string;
                };
                subsequentActions?: boolean;
                cause: {
                    activity: string;
                    resources: boolean | number[];
                };
                workflow: Workflow;
                midiOptions: import("../utils.js").MidiOptions;
                advantage: boolean;
                disadvantage: boolean;
                midi: {
                    workflowClass: typeof Workflow;
                };
                useRelaunch: {
                    relaunched?: boolean;
                    useKey?: string;
                };
                sequenceId: string;
                activity: Activity;
            }>, dialog: RollDialogConfig, message: RollMessageConfig, optionsConfig?: any): Promise<boolean>;
            postChatCardChecks(usage: import("fvtt-types/src/utils/index.mjs").InexactPartial<{
                create: {
                    measuredTemplate?: boolean;
                };
                concentration: {
                    begin: boolean;
                    end: string | null;
                };
                consume: {
                    action: boolean;
                    resources: boolean | number[];
                    spellSlot: boolean;
                };
                event: Event;
                scaling: false | number;
                spell: {
                    slot: string;
                };
                subsequentActions?: boolean;
                cause: {
                    activity: string;
                    resources: boolean | number[];
                };
                workflow: Workflow;
                midiOptions: import("../utils.js").MidiOptions;
                advantage: boolean;
                disadvantage: boolean;
                midi: {
                    workflowClass: typeof Workflow;
                };
                useRelaunch: {
                    relaunched?: boolean;
                    useKey?: string;
                };
                sequenceId: string;
                activity: Activity;
            }>, dialog: RollDialogConfig, message: RollMessageConfig, optionsConfig?: any): Promise<boolean>;
            _pendingRegionUpdate: Record<string, any> | undefined;
            _resolveAttachTokenId(workflow: Workflow | undefined, mode: "caster" | "target"): Promise<string | undefined>;
            _promptAttachTargetPicker(targets: Token.Implementation[]): Promise<string | undefined>;
            _placeEmanationTemplate(workflow: Workflow | undefined): Promise<import("fvtt-types/src/utils/index.mjs")._Override<RegionDocument, {
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
                        type: "light" | "sight" | "darkness" | "sound" | "move";
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
                        type: "light" | "sight" | "darkness" | "sound" | "move";
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
            _attachRegionActivityBehavior(regionDoc: RegionDocument.Implementation, workflow: Workflow, overTimeActivity: any, castLevel?: number): Promise<void>;
            _midiUsageContext(message: any): Promise<import("../../globals.js").MidiUsageChatContext>;
            _createUsageMessage(message?: RollMessageConfig): Promise<any>;
            get actionType(): string;
            _ammunitionActivity: /*elided*/ any | null | undefined;
            isLike(type: string): boolean;
            readonly applicableEffects: import("../../globals.js").ActivityEffectData[] | null;
            relevantLevel: number;
            actor?: Actor.Implementation;
            item: Item.Implementation;
            ammunitionItem?: Item.Implementation;
            name: string;
            uses: {
                spent: number;
                max: number;
                get value(): number;
                recovery: unknown[];
            };
            consumption: {
                scaling: {
                    allowed: boolean;
                    max: string;
                };
                spellSlot: boolean;
                targets: {
                    type: string;
                    target: string;
                    value: string;
                    scaling: {
                        mode: string;
                        formula: string;
                    };
                }[];
            };
            effects: import("../../globals.js").ActivityEffectData[];
            attack?: {
                ability: string;
                bonus: string;
                critical: {
                    threshold: number;
                };
                flat: boolean;
                type: {
                    value: string;
                    classification: string;
                };
                damage: {};
            };
            damage?: {
                critical: {
                    allow: boolean;
                    bonus: string;
                };
                parts: {
                    number: number;
                    denomination: number;
                    bonus: string;
                    types: Set<string>;
                    custom: {
                        enabled: boolean;
                        formula: string;
                    };
                    scaling: {
                        mode: string;
                        number: number;
                        formula: string;
                    };
                }[];
                onSave: string;
            };
            range?: {
                units?: string;
                reach?: number;
                value?: number;
                long?: number;
            };
            healing?: {
                number: number;
                denomination: number;
                bonus: string;
                types: Set<string>;
                custom: {
                    enabled: boolean;
                    formula: string;
                };
                scaling: {
                    mode: string;
                    number: number;
                    formula: string;
                };
            };
            overTimeProperties?: {
                turnChoice?: string;
                saveRemoves?: boolean;
                rollAs?: string;
                preRemoveConditionText?: string;
                postRemoveConditionText?: string;
                removeConditionBeforeActivity?: boolean;
                removeConditionText?: string;
            };
            metadata: {
                title: string;
                img: string;
                label: string;
                name: string;
                type: string;
                usage: {
                    actions: unknown;
                    chatCard: string;
                    dialog: unknown;
                };
            };
            refund: (consumed: unknown) => Promise<void>;
            getRollData: () => import("fvtt-types/src/utils/index.mjs").AnyMutableObject;
            rollAttack?(config: RollProcessConfig, dialog: RollDialogConfig, message: RollMessageConfig): Promise<Roll[] | null>;
            rollFormula?(config: RollProcessConfig, dialog: RollDialogConfig, message: RollMessageConfig): Promise<Roll[] | void>;
            canScale?: boolean;
            _prepareUsageConfig: (config: object) => object;
            _prepareUsageUpdates: (config: object, options?: {
                returnErrors?: boolean;
            }) => Promise<any>;
            consume: (usageConfig: object, messageConfig: object) => Promise<object | false>;
            roll?: {
                formula?: string;
                name: string;
                prompt: boolean;
                visible: boolean;
            };
            duration: {
                concentration?: boolean;
                override?: boolean;
                scalar?: boolean;
                special: string;
                units: string;
                value: number;
            };
            target: {
                template: {
                    count: string;
                    contiguous: boolean;
                    type: string;
                    size: string;
                    width: string;
                    height: string;
                    units: string;
                    stationary?: boolean;
                };
                affects: {
                    count: string;
                    type: string;
                    choice: boolean;
                    special: string;
                };
            };
            activation: {
                type: string;
                value: number;
                condition: string;
                cost?: number;
            };
            save?: import("../../globals.js").ActivitySave;
            check?: import("../../globals.js").ActivityCheck;
            getAbility?: (associated: string) => string | null;
            hasDamage: boolean;
            hasHealing: boolean;
            id: string;
            uuid: string;
            toObject(source?: boolean): import("fvtt-types/src/utils/index.mjs").AnyMutableObject;
            otherActivity?: Activity | null;
            type: string;
            useCondition: string;
            effectCondition: string;
            getTriggeredActivity: () => Promise<Activity | undefined>;
            macro: Macro.Implementation;
            midiProperties?: {
                ignoreTraits: Set<string>;
                triggeredActivityId: string;
                triggeredActivityConditionText?: string;
                followUp?: boolean;
                followUpCondition?: string;
                followUpTargets?: string;
                triggeredActivityTargets: string;
                triggeredActivityRollAs?: string;
                triggeredActivityConsume?: boolean;
                triggeredActivityConfigure?: boolean;
                autoConsume: boolean;
                forceConsumeDialog?: string;
                forceRollDialog?: string;
                forceDamageDialog?: string;
                confirmTargets: string;
                autoTargetType: string;
                autoTargetAction?: string;
                automationOnly?: boolean;
                otherActivityCompatible?: boolean;
                identifier?: string;
                displayActivityName?: boolean;
                rollMode: keyof CONFIG.Dice.RollModes;
                chooseEffects?: boolean;
                toggleEffect?: boolean;
                ignoreFullCover?: boolean;
                targetMustBeSeen?: boolean;
                removeChatButtons: string;
                magicEffect?: boolean;
                magicDamage?: boolean;
                noConcentrationCheck?: boolean;
                skipConcentrationCheck?: boolean;
                autoCEEffects: string;
                statuses?: {
                    id: string;
                    specialDuration: string[];
                    onSave: boolean;
                }[];
            };
        }, isAmmunition: boolean, otherConfig: RollProcessConfig, dialog: RollDialogConfig, config: RollProcessConfig): Promise<Roll[] | undefined>;
        configureDamageRoll(config: RollProcessConfig): void;
        getDamageConfig(config?: RollProcessConfig): any;
        getDamageRollModifiers(roll: Roll): string[];
        createDamageRollModifiers(this: Activity, rollConfig: RollProcessConfig): void;
        postProcessDamageRoll(config: RollProcessConfig, result: Array<Roll>): Promise<Array<Roll>>;
        setupCanSeeSense(usage: {
            workflow?: Workflow;
        }): Promise<void>;
        setupTargets(config: import("../../globals.js").ActivityUseConfiguration, dialog: RollDialogConfig, message: RollMessageConfig): Promise<boolean>;
        confirmTargets(): Promise<void>;
        preTargetingChecks(usage: import("../../globals.js").ActivityUseConfiguration, dialog: RollDialogConfig, message: RollMessageConfig, optionsConfig?: any): Promise<boolean>;
        preChatChecks(usage: import("../../globals.js").ActivityUseConfiguration, dialog: RollDialogConfig, message: RollMessageConfig, optionsConfig?: any): Promise<boolean>;
        postChatCardChecks(usage: import("../../globals.js").ActivityUseConfiguration, dialog: RollDialogConfig, message: RollMessageConfig, optionsConfig?: any): Promise<boolean>;
        _pendingRegionUpdate: Record<string, any> | undefined;
        _resolveAttachTokenId(workflow: Workflow | undefined, mode: "caster" | "target"): Promise<string | undefined>;
        _promptAttachTargetPicker(targets: Token.Implementation[]): Promise<string | undefined>;
        _placeEmanationTemplate(workflow: Workflow | undefined): Promise<import("fvtt-types/src/utils/index.mjs")._Override<RegionDocument, {
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
                    type: "light" | "sight" | "darkness" | "sound" | "move";
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
                    type: "light" | "sight" | "darkness" | "sound" | "move";
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
        _attachRegionActivityBehavior(regionDoc: RegionDocument.Implementation, workflow: Workflow, overTimeActivity: any, castLevel?: number): Promise<void>;
        _createUsageMessage(message?: RollMessageConfig): Promise<any>;
        get actionType(): string;
        _ammunitionActivity: {
            [x: string]: any;
            doConfirmation(actionToCall: string, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation): Promise<void>;
            _preCreate(data: any): void;
            prepareData(): void;
            useAs(actor: Actor.Implementation | null | undefined, usage?: import("fvtt-types/src/utils/index.mjs").InexactPartial<{
                create: {
                    measuredTemplate?: boolean;
                };
                concentration: {
                    begin: boolean;
                    end: string | null;
                };
                consume: {
                    action: boolean;
                    resources: boolean | number[];
                    spellSlot: boolean;
                };
                event: Event;
                scaling: false | number;
                spell: {
                    slot: string;
                };
                subsequentActions?: boolean;
                cause: {
                    activity: string;
                    resources: boolean | number[];
                };
                workflow: Workflow;
                midiOptions: import("../utils.js").MidiOptions;
                advantage: boolean;
                disadvantage: boolean;
                midi: {
                    workflowClass: typeof Workflow;
                };
                useRelaunch: {
                    relaunched?: boolean;
                    useKey?: string;
                };
                sequenceId: string;
                activity: Activity;
            }>, dialog?: RollDialogConfig, message?: RollMessageConfig): any;
            use(usage?: import("fvtt-types/src/utils/index.mjs").InexactPartial<{
                create: {
                    measuredTemplate?: boolean;
                };
                concentration: {
                    begin: boolean;
                    end: string | null;
                };
                consume: {
                    action: boolean;
                    resources: boolean | number[];
                    spellSlot: boolean;
                };
                event: Event;
                scaling: false | number;
                spell: {
                    slot: string;
                };
                subsequentActions?: boolean;
                cause: {
                    activity: string;
                    resources: boolean | number[];
                };
                workflow: Workflow;
                midiOptions: import("../utils.js").MidiOptions;
                advantage: boolean;
                disadvantage: boolean;
                midi: {
                    workflowClass: typeof Workflow;
                };
                useRelaunch: {
                    relaunched?: boolean;
                    useKey?: string;
                };
                sequenceId: string;
                activity: Activity;
            }>, dialog?: RollDialogConfig, message?: RollMessageConfig): any;
            hasConsumption(): boolean;
            shouldAutoConsume(workflow?: Workflow): boolean;
            checkAutoConsume(usage: import("../../globals.js").ActivityUseConfiguration, dialog?: RollDialogConfig): Promise<boolean>;
            rollDamage(config: RollProcessConfig, dialog?: RollDialogConfig, message?: RollMessageConfig): Promise<any>;
            _midiRollDamage(config: RollProcessConfig, dialog?: RollDialogConfig, message?: RollMessageConfig): Promise<any>;
            deferOtherDamage(config: RollProcessConfig, dialog: RollDialogConfig): boolean;
            rollOtherDamage(config: RollProcessConfig, dialog: RollDialogConfig): Promise<Roll[] | undefined>;
            _rollOtherDamageSource(source: /*elided*/ any, isAmmunition: boolean, otherConfig: RollProcessConfig, dialog: RollDialogConfig, config: RollProcessConfig): Promise<Roll[] | undefined>;
            configureDamageRoll(config: RollProcessConfig): void;
            getDamageConfig(config?: RollProcessConfig): any;
            getDamageRollModifiers(roll: Roll): string[];
            createDamageRollModifiers(this: Activity, rollConfig: RollProcessConfig): void;
            postProcessDamageRoll(config: RollProcessConfig, result: Array<Roll>): Promise<Array<Roll>>;
            setupCanSeeSense(usage: {
                workflow?: Workflow;
            }): Promise<void>;
            setupTargets(config: import("../../globals.js").ActivityUseConfiguration, dialog: RollDialogConfig, message: RollMessageConfig): Promise<boolean>;
            confirmTargets(): Promise<void>;
            preTargetingChecks(usage: import("../../globals.js").ActivityUseConfiguration, dialog: RollDialogConfig, message: RollMessageConfig, optionsConfig?: any): Promise<boolean>;
            preChatChecks(usage: import("../../globals.js").ActivityUseConfiguration, dialog: RollDialogConfig, message: RollMessageConfig, optionsConfig?: any): Promise<boolean>;
            postChatCardChecks(usage: import("../../globals.js").ActivityUseConfiguration, dialog: RollDialogConfig, message: RollMessageConfig, optionsConfig?: any): Promise<boolean>;
            _pendingRegionUpdate: Record<string, any> | undefined;
            _resolveAttachTokenId(workflow: Workflow | undefined, mode: "caster" | "target"): Promise<string | undefined>;
            _promptAttachTargetPicker(targets: Token.Implementation[]): Promise<string | undefined>;
            _placeEmanationTemplate(workflow: Workflow | undefined): Promise<import("fvtt-types/src/utils/index.mjs")._Override<RegionDocument, {
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
                        type: "light" | "sight" | "darkness" | "sound" | "move";
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
                        type: "light" | "sight" | "darkness" | "sound" | "move";
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
            _attachRegionActivityBehavior(regionDoc: RegionDocument.Implementation, workflow: Workflow, overTimeActivity: any, castLevel?: number): Promise<void>;
            _midiUsageContext(message: any): Promise<import("../../globals.js").MidiUsageChatContext>;
            _createUsageMessage(message?: RollMessageConfig): Promise<any>;
            get actionType(): string;
            _ammunitionActivity: /*elided*/ any | null | undefined;
            isLike(type: string): boolean;
            readonly applicableEffects: import("../../globals.js").ActivityEffectData[] | null;
            relevantLevel: number;
            actor?: Actor.Implementation;
            item: Item.Implementation;
            ammunitionItem?: Item.Implementation;
            name: string;
            uses: {
                spent: number;
                max: number;
                get value(): number;
                recovery: unknown[];
            };
            consumption: {
                scaling: {
                    allowed: boolean;
                    max: string;
                };
                spellSlot: boolean;
                targets: {
                    type: string;
                    target: string;
                    value: string;
                    scaling: {
                        mode: string;
                        formula: string;
                    };
                }[];
            };
            effects: import("../../globals.js").ActivityEffectData[];
            attack?: {
                ability: string;
                bonus: string;
                critical: {
                    threshold: number;
                };
                flat: boolean;
                type: {
                    value: string;
                    classification: string;
                };
                damage: {};
            };
            damage?: {
                critical: {
                    allow: boolean;
                    bonus: string;
                };
                parts: {
                    number: number;
                    denomination: number;
                    bonus: string;
                    types: Set<string>;
                    custom: {
                        enabled: boolean;
                        formula: string;
                    };
                    scaling: {
                        mode: string;
                        number: number;
                        formula: string;
                    };
                }[];
                onSave: string;
            };
            range?: {
                units?: string;
                reach?: number;
                value?: number;
                long?: number;
            };
            healing?: {
                number: number;
                denomination: number;
                bonus: string;
                types: Set<string>;
                custom: {
                    enabled: boolean;
                    formula: string;
                };
                scaling: {
                    mode: string;
                    number: number;
                    formula: string;
                };
            };
            overTimeProperties?: {
                turnChoice?: string;
                saveRemoves?: boolean;
                rollAs?: string;
                preRemoveConditionText?: string;
                postRemoveConditionText?: string;
                removeConditionBeforeActivity?: boolean;
                removeConditionText?: string;
            };
            metadata: {
                title: string;
                img: string;
                label: string;
                name: string;
                type: string;
                usage: {
                    actions: unknown;
                    chatCard: string;
                    dialog: unknown;
                };
            };
            refund: (consumed: unknown) => Promise<void>;
            getRollData: () => import("fvtt-types/src/utils/index.mjs").AnyMutableObject;
            rollAttack?(config: RollProcessConfig, dialog: RollDialogConfig, message: RollMessageConfig): Promise<Roll[] | null>;
            rollFormula?(config: RollProcessConfig, dialog: RollDialogConfig, message: RollMessageConfig): Promise<Roll[] | void>;
            canScale?: boolean;
            _prepareUsageConfig: (config: object) => object;
            _prepareUsageUpdates: (config: object, options?: {
                returnErrors?: boolean;
            }) => Promise<any>;
            consume: (usageConfig: object, messageConfig: object) => Promise<object | false>;
            roll?: {
                formula?: string;
                name: string;
                prompt: boolean;
                visible: boolean;
            };
            duration: {
                concentration?: boolean;
                override?: boolean;
                scalar?: boolean;
                special: string;
                units: string;
                value: number;
            };
            target: {
                template: {
                    count: string;
                    contiguous: boolean;
                    type: string;
                    size: string;
                    width: string;
                    height: string;
                    units: string;
                    stationary?: boolean;
                };
                affects: {
                    count: string;
                    type: string;
                    choice: boolean;
                    special: string;
                };
            };
            activation: {
                type: string;
                value: number;
                condition: string;
                cost?: number;
            };
            save?: import("../../globals.js").ActivitySave;
            check?: import("../../globals.js").ActivityCheck;
            getAbility?: (associated: string) => string | null;
            hasDamage: boolean;
            hasHealing: boolean;
            id: string;
            uuid: string;
            toObject(source?: boolean): import("fvtt-types/src/utils/index.mjs").AnyMutableObject;
            otherActivity?: Activity | null;
            type: string;
            useCondition: string;
            effectCondition: string;
            getTriggeredActivity: () => Promise<Activity | undefined>;
            macro: Macro.Implementation;
            midiProperties?: {
                ignoreTraits: Set<string>;
                triggeredActivityId: string;
                triggeredActivityConditionText?: string;
                followUp?: boolean;
                followUpCondition?: string;
                followUpTargets?: string;
                triggeredActivityTargets: string;
                triggeredActivityRollAs?: string;
                triggeredActivityConsume?: boolean;
                triggeredActivityConfigure?: boolean;
                autoConsume: boolean;
                forceConsumeDialog?: string;
                forceRollDialog?: string;
                forceDamageDialog?: string;
                confirmTargets: string;
                autoTargetType: string;
                autoTargetAction?: string;
                automationOnly?: boolean;
                otherActivityCompatible?: boolean;
                identifier?: string;
                displayActivityName?: boolean;
                rollMode: keyof CONFIG.Dice.RollModes;
                chooseEffects?: boolean;
                toggleEffect?: boolean;
                ignoreFullCover?: boolean;
                targetMustBeSeen?: boolean;
                removeChatButtons: string;
                magicEffect?: boolean;
                magicDamage?: boolean;
                noConcentrationCheck?: boolean;
                skipConcentrationCheck?: boolean;
                autoCEEffects: string;
                statuses?: {
                    id: string;
                    specialDuration: string[];
                    onSave: boolean;
                }[];
            };
        } | null | undefined;
        isLike(type: string): boolean;
        readonly applicableEffects: import("../../globals.js").ActivityEffectData[] | null;
        relevantLevel: number;
        actor?: Actor.Implementation;
        item: Item.Implementation;
        ammunitionItem?: Item.Implementation;
        name: string;
        uses: {
            spent: number;
            max: number;
            get value(): number;
            recovery: unknown[];
        };
        consumption: {
            scaling: {
                allowed: boolean;
                max: string;
            };
            spellSlot: boolean;
            targets: {
                type: string;
                target: string;
                value: string;
                scaling: {
                    mode: string;
                    formula: string;
                };
            }[];
        };
        effects: import("../../globals.js").ActivityEffectData[];
        attack?: {
            ability: string;
            bonus: string;
            critical: {
                threshold: number;
            };
            flat: boolean;
            type: {
                value: string;
                classification: string;
            };
            damage: {};
        };
        damage?: {
            critical: {
                allow: boolean;
                bonus: string;
            };
            parts: {
                number: number;
                denomination: number;
                bonus: string;
                types: Set<string>;
                custom: {
                    enabled: boolean;
                    formula: string;
                };
                scaling: {
                    mode: string;
                    number: number;
                    formula: string;
                };
            }[];
            onSave: string;
        };
        range?: {
            units?: string;
            reach?: number;
            value?: number;
            long?: number;
        };
        healing?: {
            number: number;
            denomination: number;
            bonus: string;
            types: Set<string>;
            custom: {
                enabled: boolean;
                formula: string;
            };
            scaling: {
                mode: string;
                number: number;
                formula: string;
            };
        };
        overTimeProperties?: {
            turnChoice?: string;
            saveRemoves?: boolean;
            rollAs?: string;
            preRemoveConditionText?: string;
            postRemoveConditionText?: string;
            removeConditionBeforeActivity?: boolean;
            removeConditionText?: string;
        };
        metadata: {
            title: string;
            img: string;
            label: string;
            name: string;
            type: string;
            usage: {
                actions: unknown;
                chatCard: string;
                dialog: unknown;
            };
        };
        refund: (consumed: unknown) => Promise<void>;
        getRollData: () => import("fvtt-types/src/utils/index.mjs").AnyMutableObject;
        rollAttack?(config: RollProcessConfig, dialog: RollDialogConfig, message: RollMessageConfig): Promise<Roll[] | null>;
        canScale?: boolean;
        _prepareUsageConfig: (config: object) => object;
        _prepareUsageUpdates: (config: object, options?: {
            returnErrors?: boolean;
        }) => Promise<any>;
        consume: (usageConfig: object, messageConfig: object) => Promise<object | false>;
        roll?: {
            formula?: string;
            name: string;
            prompt: boolean;
            visible: boolean;
        };
        duration: {
            concentration?: boolean;
            override?: boolean;
            scalar?: boolean;
            special: string;
            units: string;
            value: number;
        };
        target: {
            template: {
                count: string;
                contiguous: boolean;
                type: string;
                size: string;
                width: string;
                height: string;
                units: string;
                stationary?: boolean;
            };
            affects: {
                count: string;
                type: string;
                choice: boolean;
                special: string;
            };
        };
        activation: {
            type: string;
            value: number;
            condition: string;
            cost?: number;
        };
        save?: import("../../globals.js").ActivitySave;
        check?: import("../../globals.js").ActivityCheck;
        getAbility?: (associated: string) => string | null;
        hasDamage: boolean;
        hasHealing: boolean;
        id: string;
        uuid: string;
        toObject(source?: boolean): import("fvtt-types/src/utils/index.mjs").AnyMutableObject;
        otherActivity?: Activity | null;
        type: string;
        useCondition: string;
        effectCondition: string;
        getTriggeredActivity: () => Promise<Activity | undefined>;
        macro: Macro.Implementation;
        midiProperties?: {
            ignoreTraits: Set<string>;
            triggeredActivityId: string;
            triggeredActivityConditionText?: string;
            followUp?: boolean;
            followUpCondition?: string;
            followUpTargets?: string;
            triggeredActivityTargets: string;
            triggeredActivityRollAs?: string;
            triggeredActivityConsume?: boolean;
            triggeredActivityConfigure?: boolean;
            autoConsume: boolean;
            forceConsumeDialog?: string;
            forceRollDialog?: string;
            forceDamageDialog?: string;
            confirmTargets: string;
            autoTargetType: string;
            autoTargetAction?: string;
            automationOnly?: boolean;
            otherActivityCompatible?: boolean;
            identifier?: string;
            displayActivityName?: boolean;
            rollMode: keyof CONFIG.Dice.RollModes;
            chooseEffects?: boolean;
            toggleEffect?: boolean;
            ignoreFullCover?: boolean;
            targetMustBeSeen?: boolean;
            removeChatButtons: string;
            magicEffect?: boolean;
            magicDamage?: boolean;
            noConcentrationCheck?: boolean;
            skipConcentrationCheck?: boolean;
            autoCEEffects: string;
            statuses?: {
                id: string;
                specialDuration: string[];
                onSave: boolean;
            }[];
        };
    };
    LOCALIZATION_PREFIXES: any[];
    metadata: import("fvtt-types/src/foundry/common/utils/helpers.mjs").InsertKeys<{
        [x: string]: any;
    }, {
        readonly midiTitle: "midi-qol.UTILITY.Title.one";
        readonly dnd5eTitle: string;
        readonly sheetClass: {
            new (): {
                [x: string]: any;
                _midiOnAddMidiStatusDuration(event: Event): void;
                _getTabs(): any;
                _prepareMidiQolContext(context: any): Promise<any>;
                _preparePartContext(partId: any, context: any, options: any): Promise<any>;
                _onRender(context: any, options: any): Promise<void>;
            };
            DEFAULT_OPTIONS: any;
            CLEAN_ARRAYS: any[];
            PARTS: any;
        };
        readonly usage: {};
    }>;
    defineSchema(): any;
};
export declare function defineMidiUtilitySheetClass(baseClass: any): {
    new (): {
        [x: string]: any;
        _midiOnAddMidiStatusDuration(event: Event): void;
        _getTabs(): any;
        _prepareMidiQolContext(context: any): Promise<any>;
        _preparePartContext(partId: any, context: any, options: any): Promise<any>;
        _onRender(context: any, options: any): Promise<void>;
    };
    DEFAULT_OPTIONS: any;
    CLEAN_ARRAYS: any[];
    PARTS: any;
};
export {};
