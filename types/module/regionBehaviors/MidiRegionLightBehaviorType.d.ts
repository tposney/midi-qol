/** Light and darkness animations, for the animation dropdown. */
declare function animationChoices(): Record<string, string>;
/**
 * A custom RegionBehaviorType that manages an AmbientLight (or a darkness source) at the region center.
 * Creates a light when the region is viewed, repositions it when the region boundary changes,
 * and deletes it when the region is unviewed or deleted.
 *
 * Registration: CONFIG.RegionBehavior.dataModels["midi-qol.regionLight"]
 */
export declare class MidiRegionLightBehaviorType extends foundry.data.regionBehaviors.RegionBehaviorType {
    static LOCALIZATION_PREFIXES: string[];
    static defineSchema(): {
        dim: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField<{
            readonly initial: 0;
            readonly min: 0;
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionLight.FIELDS.dim.label";
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.AssignmentType<{
            readonly initial: 0;
            readonly min: 0;
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionLight.FIELDS.dim.label";
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly initial: 0;
            readonly min: 0;
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionLight.FIELDS.dim.label";
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly initial: 0;
            readonly min: 0;
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionLight.FIELDS.dim.label";
        }>>;
        bright: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField<{
            readonly initial: 0;
            readonly min: 0;
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionLight.FIELDS.bright.label";
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.AssignmentType<{
            readonly initial: 0;
            readonly min: 0;
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionLight.FIELDS.bright.label";
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly initial: 0;
            readonly min: 0;
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionLight.FIELDS.bright.label";
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly initial: 0;
            readonly min: 0;
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionLight.FIELDS.bright.label";
        }>>;
        color: import("fvtt-types/src/foundry/common/data/fields.mjs").ColorField<{
            readonly initial: null;
            readonly nullable: true;
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionLight.FIELDS.color.label";
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").ColorField.AssignmentType<{
            readonly initial: null;
            readonly nullable: true;
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionLight.FIELDS.color.label";
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").ColorField.InitializedType<{
            readonly initial: null;
            readonly nullable: true;
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionLight.FIELDS.color.label";
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").ColorField.PersistedType<{
            readonly initial: null;
            readonly nullable: true;
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionLight.FIELDS.color.label";
        }>>;
        alpha: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField<{
            readonly initial: 0.5;
            readonly min: 0;
            readonly max: 1;
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionLight.FIELDS.alpha.label";
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.AssignmentType<{
            readonly initial: 0.5;
            readonly min: 0;
            readonly max: 1;
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionLight.FIELDS.alpha.label";
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly initial: 0.5;
            readonly min: 0;
            readonly max: 1;
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionLight.FIELDS.alpha.label";
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly initial: 0.5;
            readonly min: 0;
            readonly max: 1;
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionLight.FIELDS.alpha.label";
        }>>;
        luminosity: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField<{
            readonly initial: 0.5;
            readonly min: 0;
            readonly max: 1;
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionLight.FIELDS.luminosity.label";
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.AssignmentType<{
            readonly initial: 0.5;
            readonly min: 0;
            readonly max: 1;
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionLight.FIELDS.luminosity.label";
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly initial: 0.5;
            readonly min: 0;
            readonly max: 1;
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionLight.FIELDS.luminosity.label";
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly initial: 0.5;
            readonly min: 0;
            readonly max: 1;
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionLight.FIELDS.luminosity.label";
        }>>;
        negative: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            readonly initial: false;
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionLight.FIELDS.negative.label";
            readonly hint: "BEHAVIOR.TYPES.midi-qol.regionLight.FIELDS.negative.hint";
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            readonly initial: false;
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionLight.FIELDS.negative.label";
            readonly hint: "BEHAVIOR.TYPES.midi-qol.regionLight.FIELDS.negative.hint";
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            readonly initial: false;
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionLight.FIELDS.negative.label";
            readonly hint: "BEHAVIOR.TYPES.midi-qol.regionLight.FIELDS.negative.hint";
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            readonly initial: false;
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionLight.FIELDS.negative.label";
            readonly hint: "BEHAVIOR.TYPES.midi-qol.regionLight.FIELDS.negative.hint";
        }>>>;
        priority: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField<{
            readonly initial: 0;
            readonly min: 0;
            readonly integer: true;
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionLight.FIELDS.priority.label";
            readonly hint: "BEHAVIOR.TYPES.midi-qol.regionLight.FIELDS.priority.hint";
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.AssignmentType<{
            readonly initial: 0;
            readonly min: 0;
            readonly integer: true;
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionLight.FIELDS.priority.label";
            readonly hint: "BEHAVIOR.TYPES.midi-qol.regionLight.FIELDS.priority.hint";
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly initial: 0;
            readonly min: 0;
            readonly integer: true;
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionLight.FIELDS.priority.label";
            readonly hint: "BEHAVIOR.TYPES.midi-qol.regionLight.FIELDS.priority.hint";
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly initial: 0;
            readonly min: 0;
            readonly integer: true;
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionLight.FIELDS.priority.label";
            readonly hint: "BEHAVIOR.TYPES.midi-qol.regionLight.FIELDS.priority.hint";
        }>>;
        walls: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            readonly initial: false;
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionLight.FIELDS.walls.label";
            readonly hint: "BEHAVIOR.TYPES.midi-qol.regionLight.FIELDS.walls.hint";
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            readonly initial: false;
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionLight.FIELDS.walls.label";
            readonly hint: "BEHAVIOR.TYPES.midi-qol.regionLight.FIELDS.walls.hint";
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            readonly initial: false;
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionLight.FIELDS.walls.label";
            readonly hint: "BEHAVIOR.TYPES.midi-qol.regionLight.FIELDS.walls.hint";
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            readonly initial: false;
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionLight.FIELDS.walls.label";
            readonly hint: "BEHAVIOR.TYPES.midi-qol.regionLight.FIELDS.walls.hint";
        }>>>;
        fill: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField<{
            readonly initial: false;
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionLight.FIELDS.fill.label";
            readonly hint: "BEHAVIOR.TYPES.midi-qol.regionLight.FIELDS.fill.hint";
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.AssignmentType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            readonly initial: false;
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionLight.FIELDS.fill.label";
            readonly hint: "BEHAVIOR.TYPES.midi-qol.regionLight.FIELDS.fill.hint";
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            readonly initial: false;
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionLight.FIELDS.fill.label";
            readonly hint: "BEHAVIOR.TYPES.midi-qol.regionLight.FIELDS.fill.hint";
        }>>, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, {
            readonly initial: false;
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionLight.FIELDS.fill.label";
            readonly hint: "BEHAVIOR.TYPES.midi-qol.regionLight.FIELDS.fill.hint";
        }>>>;
        animationType: import("fvtt-types/src/foundry/common/data/fields.mjs").StringField<{
            readonly initial: null;
            readonly nullable: true;
            readonly blank: true;
            readonly choices: typeof animationChoices;
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionLight.FIELDS.animationType.label";
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptionsWhenChoicesProvided, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly initial: null;
            readonly nullable: true;
            readonly blank: true;
            readonly choices: typeof animationChoices;
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionLight.FIELDS.animationType.label";
        }>>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptionsWhenChoicesProvided, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly initial: null;
            readonly nullable: true;
            readonly blank: true;
            readonly choices: typeof animationChoices;
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionLight.FIELDS.animationType.label";
        }>>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptionsWhenChoicesProvided, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly initial: null;
            readonly nullable: true;
            readonly blank: true;
            readonly choices: typeof animationChoices;
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionLight.FIELDS.animationType.label";
        }>>>>;
        animationSpeed: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField<{
            readonly initial: 5;
            readonly min: 0;
            readonly max: 10;
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionLight.FIELDS.animationSpeed.label";
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.AssignmentType<{
            readonly initial: 5;
            readonly min: 0;
            readonly max: 10;
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionLight.FIELDS.animationSpeed.label";
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly initial: 5;
            readonly min: 0;
            readonly max: 10;
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionLight.FIELDS.animationSpeed.label";
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly initial: 5;
            readonly min: 0;
            readonly max: 10;
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionLight.FIELDS.animationSpeed.label";
        }>>;
        animationIntensity: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField<{
            readonly initial: 5;
            readonly min: 1;
            readonly max: 10;
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionLight.FIELDS.animationIntensity.label";
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.AssignmentType<{
            readonly initial: 5;
            readonly min: 1;
            readonly max: 10;
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionLight.FIELDS.animationIntensity.label";
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly initial: 5;
            readonly min: 1;
            readonly max: 10;
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionLight.FIELDS.animationIntensity.label";
        }>, import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
            readonly initial: 5;
            readonly min: 1;
            readonly max: 10;
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionLight.FIELDS.animationIntensity.label";
        }>>;
        lightDocId: import("fvtt-types/src/foundry/common/data/fields.mjs").StringField<{
            readonly initial: null;
            readonly nullable: true;
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionLight.FIELDS.lightDocId.label";
        }, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedAssignmentType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly initial: null;
            readonly nullable: true;
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionLight.FIELDS.lightDocId.label";
        }>>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly initial: null;
            readonly nullable: true;
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionLight.FIELDS.lightDocId.label";
        }>>>, import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
            readonly initial: null;
            readonly nullable: true;
            readonly label: "BEHAVIOR.TYPES.midi-qol.regionLight.FIELDS.lightDocId.label";
        }>>>>;
    };
    /**
     * Where the light goes: inside the region, which clips it (see registerHooks). A single shape's own centre (an
     * emanation's token, a circle's or rectangle's centre) when that is inside the region; otherwise, and for cones and
     * lines, the centre of the region's area. Not the centre of the region's bounds: those are clipped where walls or the
     * scene edge constrain the region.
     */
    _lightPosition(): {
        x: number;
        y: number;
    } | undefined;
    /** Fill Region: the radius (in scene units) that reaches the region's farthest point from the light. */
    _fillRadius(position: {
        x: number;
        y: number;
    }): number | undefined;
    _buildLightConfig(position?: {
        x: number;
        y: number;
    }): Record<string, any>;
    /**
     * Create an AmbientLight at the region center when the behavior is viewed.
     * @this {MidiRegionLightBehaviorType}
     */
    static _onBehaviorViewed(this: MidiRegionLightBehaviorType, _event: any): Promise<void>;
    /**
     * Destroy the AmbientLight when the behavior is unviewed.
     * @this {MidiRegionLightBehaviorType}
     */
    static _onBehaviorUnviewed(this: MidiRegionLightBehaviorType, _event: any): Promise<void>;
    /**
     * Reposition the AmbientLight when the region boundary changes.
     * @this {MidiRegionLightBehaviorType}
     */
    static _onRegionBoundary(this: MidiRegionLightBehaviorType, _event: any): Promise<void>;
    /**
     * Confine a region light (or darkness) to its region: the light's polygon gets the region's outline as a boundary
     * shape. Called once at init.
     */
    static registerHooks(): void;
    static events: {
        behaviorViewed: typeof MidiRegionLightBehaviorType._onBehaviorViewed;
        behaviorUnviewed: typeof MidiRegionLightBehaviorType._onBehaviorUnviewed;
        regionBoundary: typeof MidiRegionLightBehaviorType._onRegionBoundary;
    };
    /** Update the light config when behavior system data changes. */
    _onUpdate(changed: any, options: any, userId: string): void;
    /** Safety cleanup: delete the light if the behavior is deleted. */
    _onDelete(options: any, userId: string): void;
}
export {};
