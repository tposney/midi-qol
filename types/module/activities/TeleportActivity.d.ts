import { Activity, RollMessageConfig } from "../../globals.js";
import { Workflow } from "../Workflow.js";
import { TokenHighlight } from "../lib/tokenHighlight.js";
export declare let MidiTeleportActivity: ReturnType<typeof defineMidiTeleportActivityClass>;
export declare let MidiTeleportSheet: ReturnType<typeof defineMidiTeleportSheetClass>;
/** dnd5e 6's teleport activity, given a midi workflow. Not present on dnd5e 5.x. */
export declare function setupTeleportActivity(): void;
export declare const teleportMoverModes: readonly ["default", "caster", "casterAndTargets", "targets", "swap"];
export type TeleportMoverMode = typeof teleportMoverModes[number];
export declare const teleportPlanModes: readonly ["button", "auto"];
interface Mover {
    token: Token.Implementation;
    /** "plan": its owner plans the move (Foundry movement planning); "place": the user picks the destination. */
    method: "plan" | "place";
}
/** A token position; `level` is the scene level's id (Foundry 14). */
type Position = {
    x: number;
    y: number;
    elevation?: number;
    level?: string;
};
export interface TeleportPlan {
    token: Token.Implementation;
    plan: {
        id?: string;
        origin: Position;
        destination: Position;
        waypoints?: unknown[];
    };
}
export interface TeleportResult extends TeleportPlan {
    moved: boolean;
}
export interface TeleportConfig {
    maxDistance: number;
    tokens: Token.Implementation[];
    movers: TeleportMoverMode;
}
/** midiOptions.teleport: "button" leaves an auto teleport to the card's button; destinations move without asking. */
export type TeleportOption = "button" | {
    destinations?: Record<string, Position>;
};
type Rect = {
    x: number;
    y: number;
    width: number;
    height: number;
};
/** A token's footprint at a position: its grid spaces (square and hex grids) and bounds. */
interface Space {
    rect: Rect;
    cells?: {
        i: number;
        j: number;
    }[];
    level?: string;
}
declare let defineMidiTeleportActivityClass: <T extends Activity>(ActivityClass: T) => {
    new (): {
        [x: string]: any;
        /** A caster-only teleport lists the caster on its card. */
        _createUsageMessage(message?: RollMessageConfig): Promise<any>;
        /** Plan: auto. The workflow's teleport, after its effects and damage, unless the use leaves it to the button. */
        autoTeleport(workflow: Workflow): Promise<TeleportResult[] | null | undefined>;
        /** The teleport distance in the scene's units (dnd5e's #getSceneMaxDistance). */
        get sceneMaxDistance(): number | null;
        get casterToken(): Token.Implementation | undefined;
        /**
         * The tokens the activity teleports and how each one's destination is chosen. `listed`: what the card's targets
         * list shows when its Teleport button is pressed.
         */
        teleportMovers(targets: Token.Implementation[], listed?: Token.Implementation[]): Mover[];
        /**
         * Teleport the movers: those planned by their owner move as dnd5e moves them; the others go where the user
         * picks, within 5 ft of the caster's destination (casterAndTargets) or within the teleport distance of the
         * caster (targets), and a GM moves those the user doesn't own. dnd5e's and midi's teleport hooks and midi's
         * preTeleport/postTeleport on-use passes run as for dnd5e's own planning. A use's `midiOptions.teleport`
         * destinations replace the planning and picking.
         */
        planTeleport({ message, workflow, listed }?: {
            message?: ChatMessage.Implementation;
            workflow?: Workflow;
            listed?: Token.Implementation[];
        }): Promise<TeleportResult[] | null | undefined>;
        /** The card's Teleport button goes once the move is made. */
        _midiRecordTeleported(message: ChatMessage.Implementation, workflow: Workflow | undefined): Promise<void>;
        _midiWorkflowTargets(workflow: Workflow | undefined, message: ChatMessage.Implementation | undefined): Token.Implementation[];
        /** Run the item's on-use macros for a teleport pass; true when one returned false (cancel). */
        _midiCallTeleportMacros(workflow: Workflow, pass: "preTeleport" | "postTeleport", options: Record<string, unknown>): Promise<boolean>;
        /** Swap: the caster and the target trade places, the target within the teleport distance (and seen, if required). */
        _midiPlanSwap(movers: Mover[], maxDistance: number): (TeleportPlan[] & {
            failed?: boolean;
        }) | undefined;
        _midiPlanMovers(movers: Mover[], maxDistance: number, highlight: TokenHighlight, destinations?: Record<string, Position>): Promise<(TeleportPlan[] & {
            failed?: boolean;
        }) | undefined>;
        /** Why a placed mover can't go to `space`: too far from its anchor, or (unless the teleport fails instead) blocked. */
        _midiPlacementProblem(token: Token.Implementation, space: Space, constraint: {
            near?: Space;
            within: number;
        }, plans: TeleportPlan[], fail: boolean): string | undefined;
        /**
         * Let the user pick where `token` goes: Foundry's token placement preview, nothing created. Undefined when the
         * user skips it (right click), null when they dismiss the placement.
         */
        _midiPickDestination(token: Token.Implementation, constraint: {
            near?: Space;
            within: number;
        }, plans: TeleportPlan[], fail: boolean): Promise<Position | undefined | null>;
        /** The nearest free space within 5 ft of `anchor`, or undefined. */
        _midiNearestFree(token: Token.Implementation, anchor: Space, plans: TeleportPlan[]): Position | undefined;
        /**
         * Why `token` can't arrive at `space`, or undefined: it must be inside the scene, on an unoccupied space (other
         * tokens and the other movers' destinations), not inside a wall, reachable from `reachableFrom` without
         * crossing a wall, and seen from `from` when the activity requires sight.
         */
        _midiDestinationProblem(token: Token.Implementation, space: Space, plans: TeleportPlan[], { from, reachableFrom }?: {
            from?: Token.Implementation;
            reachableFrom?: Space;
        }): string | undefined;
        /** A wall between two points on `levelId`'s level (default: the token's). */
        _midiCollides(origin: {
            x: number;
            y: number;
        }, destination: {
            x: number;
            y: number;
        }, type: "move" | "sight", token: Token.Implementation, levelId?: string): boolean;
        /**
         * A movement-blocking wall crossing the space: each grid space's edges and diagonals (the bounds when gridless),
         * inset so walls along its border don't count.
         */
        _midiWallInside(space: Space, token: Token.Implementation): boolean;
        _midiPositionOf(token: Token.Implementation): Position;
        /** `token`'s footprint at `position`: its grid spaces on square and hex grids, its bounds. */
        _midiSpace(token: Token.Implementation, position: Position | TokenDocument.Implementation): Space;
        _midiOverlaps(a: Space, b: Space): boolean;
        /**
         * How far apart two spaces are, in scene units, as the grid measures from space to space: one grid space's
         * distance when adjacent. Gridless: the gap between their bounds.
         */
        _midiGap(a: Space, b: Space): number;
        /** The distance a token's own teleport covers, as the grid measures it. */
        _midiTravel(token: Token.Implementation, from: Position, to: Position): number;
        _midiMove({ token, plan }: TeleportPlan): Promise<boolean>;
        /** Dimension Door: an arrival in an occupied or filled space fails the teleport and damages every traveller. */
        _midiFailTeleport(travellers: Token.Implementation[]): Promise<void>;
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
        }>, dialog?: import("../../globals.js").RollDialogConfig, message?: RollMessageConfig): Promise<any>;
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
        }>, dialog?: import("../../globals.js").RollDialogConfig, message?: RollMessageConfig): Promise<any>;
        prepareUse(usage: import("fvtt-types/src/utils/index.mjs").InexactPartial<{
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
        }>, dialog: import("../../globals.js").RollDialogConfig, message: RollMessageConfig): Promise<{
            done: true;
            result: unknown;
        } | {
            done: false;
            state: import("./useRelaunch.js").UseState;
        }>;
        onUsePreUse(state: import("./useRelaunch.js").UseState, newActivity: Activity, usageConfig: import("../../globals.js").ActivityUseConfiguration): boolean;
        onUseConsumption(state: import("./useRelaunch.js").UseState, newActivity: Activity, usageConfig: import("../../globals.js").ActivityUseConfiguration): void;
        finishUse(state: import("./useRelaunch.js").UseState, useResults: any): Promise<unknown>;
        hasConsumption(): boolean;
        shouldAutoConsume(workflow?: Workflow): boolean;
        checkAutoConsume(usage: import("../../globals.js").ActivityUseConfiguration, dialog?: import("../../globals.js").RollDialogConfig): Promise<boolean>;
        setupCanSeeSense(usage: {
            workflow?: Workflow;
        }): Promise<void>;
        setupTargets(config: import("../../globals.js").ActivityUseConfiguration, dialog: import("../../globals.js").RollDialogConfig, message: RollMessageConfig): Promise<boolean>;
        confirmTargets(): Promise<void>;
        preTargetingChecks(usage: import("../../globals.js").ActivityUseConfiguration, dialog: import("../../globals.js").RollDialogConfig, message: RollMessageConfig, optionsConfig?: any): Promise<boolean>;
        preChatChecks(usage: import("../../globals.js").ActivityUseConfiguration, dialog: import("../../globals.js").RollDialogConfig, message: RollMessageConfig, optionsConfig?: any): Promise<boolean>;
        postChatCardChecks(usage: import("../../globals.js").ActivityUseConfiguration, dialog: import("../../globals.js").RollDialogConfig, message: RollMessageConfig, optionsConfig?: any): Promise<boolean>;
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
                    type: "sound" | "light" | "sight" | "darkness" | "move";
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
                    type: "sound" | "light" | "sight" | "darkness" | "move";
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
            }>, dialog?: import("../../globals.js").RollDialogConfig, message?: RollMessageConfig): Promise<any>;
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
            }>, dialog?: import("../../globals.js").RollDialogConfig, message?: RollMessageConfig): Promise<any>;
            prepareUse(usage: import("fvtt-types/src/utils/index.mjs").InexactPartial<{
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
            }>, dialog: import("../../globals.js").RollDialogConfig, message: RollMessageConfig): Promise<{
                done: true;
                result: unknown;
            } | {
                done: false;
                state: import("./useRelaunch.js").UseState;
            }>;
            onUsePreUse(state: import("./useRelaunch.js").UseState, newActivity: Activity, usageConfig: import("../../globals.js").ActivityUseConfiguration): boolean;
            onUseConsumption(state: import("./useRelaunch.js").UseState, newActivity: Activity, usageConfig: import("../../globals.js").ActivityUseConfiguration): void;
            finishUse(state: import("./useRelaunch.js").UseState, useResults: any): Promise<unknown>;
            hasConsumption(): boolean;
            shouldAutoConsume(workflow?: Workflow): boolean;
            checkAutoConsume(usage: import("../../globals.js").ActivityUseConfiguration, dialog?: import("../../globals.js").RollDialogConfig): Promise<boolean>;
            setupCanSeeSense(usage: {
                workflow?: Workflow;
            }): Promise<void>;
            setupTargets(config: import("../../globals.js").ActivityUseConfiguration, dialog: import("../../globals.js").RollDialogConfig, message: RollMessageConfig): Promise<boolean>;
            confirmTargets(): Promise<void>;
            preTargetingChecks(usage: import("../../globals.js").ActivityUseConfiguration, dialog: import("../../globals.js").RollDialogConfig, message: RollMessageConfig, optionsConfig?: any): Promise<boolean>;
            preChatChecks(usage: import("../../globals.js").ActivityUseConfiguration, dialog: import("../../globals.js").RollDialogConfig, message: RollMessageConfig, optionsConfig?: any): Promise<boolean>;
            postChatCardChecks(usage: import("../../globals.js").ActivityUseConfiguration, dialog: import("../../globals.js").RollDialogConfig, message: RollMessageConfig, optionsConfig?: any): Promise<boolean>;
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
                        type: "sound" | "light" | "sight" | "darkness" | "move";
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
                        type: "sound" | "light" | "sight" | "darkness" | "move";
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
            rollAttack?(config: import("../../globals.js").RollProcessConfig, dialog: import("../../globals.js").RollDialogConfig, message: RollMessageConfig): Promise<Roll[] | null>;
            rollDamage(config: import("../../globals.js").RollProcessConfig, dialog: import("../../globals.js").RollDialogConfig, message: RollMessageConfig): Promise<Roll[] | void>;
            rollFormula?(config: import("../../globals.js").RollProcessConfig, dialog: import("../../globals.js").RollDialogConfig, message: RollMessageConfig): Promise<Roll[] | void>;
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
            deferOtherDamage: (config: import("../../globals.js").RollProcessConfig, dialog: import("../../globals.js").RollDialogConfig) => boolean;
            rollOtherDamage: (config: import("../../globals.js").RollProcessConfig, dialog: import("../../globals.js").RollDialogConfig) => Promise<Roll[] | undefined>;
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
        rollAttack?(config: import("../../globals.js").RollProcessConfig, dialog: import("../../globals.js").RollDialogConfig, message: RollMessageConfig): Promise<Roll[] | null>;
        rollDamage(config: import("../../globals.js").RollProcessConfig, dialog: import("../../globals.js").RollDialogConfig, message: RollMessageConfig): Promise<Roll[] | void>;
        rollFormula?(config: import("../../globals.js").RollProcessConfig, dialog: import("../../globals.js").RollDialogConfig, message: RollMessageConfig): Promise<Roll[] | void>;
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
        deferOtherDamage: (config: import("../../globals.js").RollProcessConfig, dialog: import("../../globals.js").RollDialogConfig) => boolean;
        rollOtherDamage: (config: import("../../globals.js").RollProcessConfig, dialog: import("../../globals.js").RollDialogConfig) => Promise<Roll[] | undefined>;
    };
    LOCALIZATION_PREFIXES: any[];
    metadata: import("fvtt-types/src/foundry/common/utils/helpers.mjs").InsertKeys<{
        [x: string]: any;
    }, {
        readonly midiTitle: "midi-qol.TELEPORT.Title.one";
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
            PARTS: any;
            DEFAULT_OPTIONS: foundry.applications.api.ApplicationV2.DefaultOptions;
            CLEAN_ARRAYS: any[];
        };
        readonly usage: {
            readonly actions: {
                readonly planTeleport: typeof cardPlanTeleport;
            };
        };
        readonly targetPhase: "pre";
    }>;
};
declare let defineMidiTeleportSheetClass: (baseClass: any) => {
    new (): {
        [x: string]: any;
        _midiOnAddMidiStatusDuration(event: Event): void;
        _getTabs(): any;
        _prepareMidiQolContext(context: any): Promise<any>;
        _preparePartContext(partId: any, context: any, options: any): Promise<any>;
        _onRender(context: any, options: any): Promise<void>;
    };
    PARTS: any;
    DEFAULT_OPTIONS: foundry.applications.api.ApplicationV2.DefaultOptions;
    CLEAN_ARRAYS: any[];
};
/** The card's Teleport button: the tokens its targets list shows, ticked, in the Targeted or Selected view. */
declare function cardPlanTeleport(this: Activity, event: PointerEvent, target: HTMLElement, message: ChatMessage.Implementation): any;
export {};
