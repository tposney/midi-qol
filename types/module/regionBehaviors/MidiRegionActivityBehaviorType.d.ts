/**
 * A custom RegionBehaviorType that runs activities for tokens entering/exiting a region or on their turns. Effects
 * applied while inside are dnd5e's `applyActiveEffect` behaviour, created alongside (see `_attachRegionActivityBehavior`).
 *
 * Each rule is { trigger, action, targetUuid } where:
 * - trigger: "entry" | "exit" | "turnStart" | "turnEnd"
 * - action: "useActivity"
 * - targetUuid: full UUID of the activity
 *
 * Registration: CONFIG.RegionBehavior.dataModels["midi-qol.regionActivity"]
 */
export declare class MidiRegionActivityBehaviorType extends foundry.data.regionBehaviors.RegionBehaviorType {
    static LOCALIZATION_PREFIXES: string[];
    static defineSchema(): {
        sourceItemUuid: import("fvtt-types/src/foundry/common/data/fields.mjs").StringField<{
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.sourceItemUuid.label";
            readonly hint: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.sourceItemUuid.hint";
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.sourceItemUuid.label";
            readonly hint: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.sourceItemUuid.hint";
        }>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.sourceItemUuid.label";
            readonly hint: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.sourceItemUuid.hint";
        }>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.sourceItemUuid.label";
            readonly hint: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.sourceItemUuid.hint";
        }>>, {
            initial: undefined;
        }>>>;
        sourceActorUuid: import("fvtt-types/src/foundry/common/data/fields.mjs").StringField<{
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.sourceActorUuid.label";
            readonly hint: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.sourceActorUuid.hint";
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.sourceActorUuid.label";
            readonly hint: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.sourceActorUuid.hint";
        }>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.sourceActorUuid.label";
            readonly hint: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.sourceActorUuid.hint";
        }>>, {
            initial: undefined;
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.sourceActorUuid.label";
            readonly hint: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.sourceActorUuid.hint";
        }>>, {
            initial: undefined;
        }>>>;
        rules: import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField<import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField<{
            readonly trigger: import("fvtt-types/src/foundry/common/data/fields.mjs").StringField<{
                readonly required: true;
                readonly blank: false;
                readonly label: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.rules.trigger.label";
            }, string, string, string>;
            readonly action: import("fvtt-types/src/foundry/common/data/fields.mjs").StringField<{
                readonly required: true;
                readonly blank: false;
                readonly label: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.rules.action.label";
            }, string, string, string>;
            readonly targetUuid: import("fvtt-types/src/foundry/common/data/fields.mjs").StringField<{
                readonly required: true;
                readonly blank: false;
                readonly label: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.rules.targetUuid.label";
            }, string, string, string>;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField.Internal.AssignmentType<{
            readonly trigger: import("fvtt-types/src/foundry/common/data/fields.mjs").StringField<{
                readonly required: true;
                readonly blank: false;
                readonly label: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.rules.trigger.label";
            }, string, string, string>;
            readonly action: import("fvtt-types/src/foundry/common/data/fields.mjs").StringField<{
                readonly required: true;
                readonly blank: false;
                readonly label: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.rules.action.label";
            }, string, string, string>;
            readonly targetUuid: import("fvtt-types/src/foundry/common/data/fields.mjs").StringField<{
                readonly required: true;
                readonly blank: false;
                readonly label: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.rules.targetUuid.label";
            }, string, string, string>;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField.DefaultOptions>, {
            trigger: string;
            action: string;
            targetUuid: string;
        }, {
            trigger: string;
            action: string;
            targetUuid: string;
        }>, {
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.rules.label";
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField.Internal.AssignmentType<{
            readonly trigger: import("fvtt-types/src/foundry/common/data/fields.mjs").StringField<{
                readonly required: true;
                readonly blank: false;
                readonly label: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.rules.trigger.label";
            }, string, string, string>;
            readonly action: import("fvtt-types/src/foundry/common/data/fields.mjs").StringField<{
                readonly required: true;
                readonly blank: false;
                readonly label: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.rules.action.label";
            }, string, string, string>;
            readonly targetUuid: import("fvtt-types/src/foundry/common/data/fields.mjs").StringField<{
                readonly required: true;
                readonly blank: false;
                readonly label: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.rules.targetUuid.label";
            }, string, string, string>;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField.DefaultOptions>, {
            trigger: string;
            action: string;
            targetUuid: string;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").ArrayField.AssignmentType<import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField.Internal.AssignmentType<{
            readonly trigger: import("fvtt-types/src/foundry/common/data/fields.mjs").StringField<{
                readonly required: true;
                readonly blank: false;
                readonly label: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.rules.trigger.label";
            }, string, string, string>;
            readonly action: import("fvtt-types/src/foundry/common/data/fields.mjs").StringField<{
                readonly required: true;
                readonly blank: false;
                readonly label: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.rules.action.label";
            }, string, string, string>;
            readonly targetUuid: import("fvtt-types/src/foundry/common/data/fields.mjs").StringField<{
                readonly required: true;
                readonly blank: false;
                readonly label: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.rules.targetUuid.label";
            }, string, string, string>;
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").SchemaField.DefaultOptions>, {
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.rules.label";
        }>, {
            trigger: string;
            action: string;
            targetUuid: string;
        }[], {
            trigger: string;
            action: string;
            targetUuid: string;
        }, {
            trigger: string;
            action: string;
            targetUuid: string;
        }[]>;
        dispositionFilter: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField<{
            readonly initial: -1;
            readonly choices: {
                readonly [-1]: "Enemies";
                readonly 0: "All";
                readonly 1: "Allies";
            };
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.dispositionFilter.label";
            readonly hint: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.dispositionFilter.hint";
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.AssignmentType<{
            readonly initial: -1;
            readonly choices: {
                readonly [-1]: "Enemies";
                readonly 0: "All";
                readonly 1: "Allies";
            };
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.dispositionFilter.label";
            readonly hint: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.dispositionFilter.hint";
        }>, number, number>;
        castLevel: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField<{
            readonly initial: 0;
            readonly integer: true;
            readonly min: 0;
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.castLevel.label";
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.AssignmentType<{
            readonly initial: 0;
            readonly integer: true;
            readonly min: 0;
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.castLevel.label";
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly initial: 0;
            readonly integer: true;
            readonly min: 0;
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.castLevel.label";
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly initial: 0;
            readonly integer: true;
            readonly min: 0;
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.castLevel.label";
        }>>;
        excludeSource: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            readonly initial: true;
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.excludeSource.label";
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            readonly initial: true;
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.excludeSource.label";
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            readonly initial: true;
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.excludeSource.label";
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            readonly initial: true;
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.excludeSource.label";
        }>>>;
        oncePerTurn: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            readonly initial: true;
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.oncePerTurn.label";
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            readonly initial: true;
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.oncePerTurn.label";
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            readonly initial: true;
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.oncePerTurn.label";
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            readonly initial: true;
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.oncePerTurn.label";
        }>>>;
        activationEntry: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            readonly initial: true;
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.activationEntry.label";
            readonly hint: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.activationEntry.hint";
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            readonly initial: true;
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.activationEntry.label";
            readonly hint: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.activationEntry.hint";
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            readonly initial: true;
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.activationEntry.label";
            readonly hint: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.activationEntry.hint";
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            readonly initial: true;
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.activationEntry.label";
            readonly hint: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.activationEntry.hint";
        }>>>;
        moveDistance: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField<{
            readonly initial: 0;
            readonly min: 0;
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.moveDistance.label";
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.AssignmentType<{
            readonly initial: 0;
            readonly min: 0;
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.moveDistance.label";
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly initial: 0;
            readonly min: 0;
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.moveDistance.label";
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly initial: 0;
            readonly min: 0;
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.moveDistance.label";
        }>>;
        moveDirection: import("fvtt-types/src/foundry/common/data/fields.mjs").StringField<{
            readonly initial: "away";
            readonly choices: readonly ["away", "choose"];
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.moveDirection.label";
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<"choose" | "away", import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptionsWhenChoicesProvided, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly initial: "away";
            readonly choices: readonly ["away", "choose"];
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.moveDirection.label";
        }>>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<"choose" | "away", import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptionsWhenChoicesProvided, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly initial: "away";
            readonly choices: readonly ["away", "choose"];
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.moveDirection.label";
        }>>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<"choose" | "away", import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptionsWhenChoicesProvided, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly initial: "away";
            readonly choices: readonly ["away", "choose"];
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.moveDirection.label";
        }>>>>;
        moveTiming: import("fvtt-types/src/foundry/common/data/fields.mjs").StringField<{
            readonly initial: "start";
            readonly choices: readonly ["start", "end"];
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.moveTiming.label";
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<"start" | "end", import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptionsWhenChoicesProvided, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly initial: "start";
            readonly choices: readonly ["start", "end"];
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.moveTiming.label";
        }>>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<"start" | "end", import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptionsWhenChoicesProvided, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly initial: "start";
            readonly choices: readonly ["start", "end"];
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.moveTiming.label";
        }>>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<"start" | "end", import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptionsWhenChoicesProvided, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly initial: "start";
            readonly choices: readonly ["start", "end"];
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.moveTiming.label";
        }>>>>;
        wallRestriction: import("fvtt-types/src/foundry/common/data/fields.mjs").StringField<{
            readonly initial: "none";
            readonly choices: readonly ["none", "light", "darkness", "sight", "sound", "move"];
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.wallRestriction.label";
            readonly hint: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.wallRestriction.hint";
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<"none" | "sound" | "light" | "sight" | "darkness" | "move", import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptionsWhenChoicesProvided, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly initial: "none";
            readonly choices: readonly ["none", "light", "darkness", "sight", "sound", "move"];
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.wallRestriction.label";
            readonly hint: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.wallRestriction.hint";
        }>>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<"none" | "sound" | "light" | "sight" | "darkness" | "move", import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptionsWhenChoicesProvided, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly initial: "none";
            readonly choices: readonly ["none", "light", "darkness", "sight", "sound", "move"];
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.wallRestriction.label";
            readonly hint: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.wallRestriction.hint";
        }>>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<"none" | "sound" | "light" | "sight" | "darkness" | "move", import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptionsWhenChoicesProvided, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly initial: "none";
            readonly choices: readonly ["none", "light", "darkness", "sight", "sound", "move"];
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.wallRestriction.label";
            readonly hint: "BEHAVIOR.TYPES.midi-qol.regionActivity.FIELDS.wallRestriction.hint";
        }>>>>;
    };
    _passesDispositionFilter(token: TokenDocument.Implementation): boolean;
    _isSourceToken(token: TokenDocument.Implementation): boolean;
    /** Extract a stable short key from an activity UUID. */
    _activityKeyFromUuid(activityUuid: string): string;
    /**
     * Once-per-turn tracking stored on the Combat document.
     *
     * Why the Combat document:
     * - Only exists during combat (which is exactly when "once per turn" matters)
     * - Persists through page reloads (unlike a runtime Map)
     * - Automatically cleaned up when combat ends (unlike actor flags)
     * - No pollution of actor or behavior documents
     *
     * Flag path: `flags.midi-qol.regionTriggers.{behaviorId}.{tokenId}-{activityKey}`. The token, not its actor: unlinked
     * tokens of one actor share the actor's id.
     * Flag value: `"{round}.{turn}"` — identifies the specific combatant turn.
     * The behaviorId scopes entries per-cast so re-casting after concentration drop
     * creates a new namespace with no stale data.
     */
    _hasTriggeredThisTurn(token: TokenDocument.Implementation, activityUuid: string, turn?: string): boolean;
    _markTriggeredThisTurn(token: TokenDocument.Implementation, activityUuid: string, turn?: string): Promise<void>;
    /** `turn` ("round.turn") is the turn a turn event belongs to: turn end fires once the combat has moved on. */
    _executeRulesForTrigger(token: TokenDocument.Implementation, trigger: string, turn?: string): Promise<void>;
    sourceActorUuid: string;
    activationEntry: boolean;
    moveDistance: number;
    moveDirection: "away" | "choose";
    moveTiming: "start" | "end";
    /** Core sends tokens already inside an entry right after activating a behavior, in the same synchronous pass. */
    _activating: boolean;
    static _onBehaviorActivated(this: MidiRegionActivityBehaviorType): void;
    /**
     * Core counts a token in the region's shape and band; a sphere or emanation also reaches only so far in 3D, and a floor
     * between the area's origin and the token blocks it.
     */
    _inReach(token: TokenDocument.Implementation): boolean;
    static _onTokenEnter(this: MidiRegionActivityBehaviorType, event: any): Promise<void>;
    static _onTokenExit(this: MidiRegionActivityBehaviorType, event: any): Promise<void>;
    static _onTokenTurnStart(this: MidiRegionActivityBehaviorType, event: any): Promise<void>;
    static _onTokenTurnEnd(this: MidiRegionActivityBehaviorType, event: any): Promise<void>;
    _triggerActivity(token: TokenDocument.Implementation, activityUuid: string): Promise<void>;
    static _executeTriggerActivity(data: {
        activityUuid: string;
        targetUuids: string[];
        castLevel: number;
        sourceActorUuid: string;
    }): Promise<void>;
    static events: {
        behaviorActivated: typeof MidiRegionActivityBehaviorType._onBehaviorActivated;
        tokenEnter: typeof MidiRegionActivityBehaviorType._onTokenEnter;
        tokenExit: typeof MidiRegionActivityBehaviorType._onTokenExit;
        tokenTurnStart: typeof MidiRegionActivityBehaviorType._onTokenTurnStart;
        tokenTurnEnd: typeof MidiRegionActivityBehaviorType._onTokenTurnEnd;
    };
}
/**
 * `preCreateActiveEffect`: dnd5e's region behaviours apply to every matching token, the caster included. When the
 * activity's midi region settings exclude the source, the caster's copy is not created, on entry or on re-application.
 */
export declare function excludeRegionSourceEffect(effect: ActiveEffect.Implementation, data: ActiveEffect.CreateData): boolean | void;
/** `combatTurnChange`: moves the regions whose behaviour moves them on the turn that just started or ended. */
export declare function moveRegionsOnTurnChange(combat: Combat.Implementation, previous: Combat.HistoryData | undefined, current: Combat.HistoryData): Promise<void>;
