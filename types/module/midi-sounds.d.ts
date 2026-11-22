import type { Cue } from "./lib/cues.js";
import type { Workflow } from "./Workflow.js";
import type { Presenter } from "./services/presenters/service.js";
interface SoundSpec {
    playlistName: string;
    soundName: string;
}
export declare class MidiSounds {
    static weaponBaseTypes: {};
    static getSound(playListName: string, soundName: string): {
        playlist: Playlist | undefined;
        sound: Collection.GetReturn<import("fvtt-types/src/utils/index.mjs")._Override<PlaylistSound, {
            readonly id: string;
            _id: string;
            readonly uuid: string;
            _source: import("fvtt-types/src/utils/index.mjs")._Override<{
                _id: import("fvtt-types/src/foundry/common/data/fields.mjs").DocumentIdField.InitializedType<import("fvtt-types/src/foundry/common/data/fields.mjs").DocumentIdField.DefaultOptions>;
                name: string;
                description: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
                    initial: undefined;
                }>>;
                path: import("fvtt-types/src/foundry/common/data/fields.mjs").FilePathField.InitializedType<{
                    categories: ["AUDIO"];
                }>;
                channel: "" | import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<"environment" | "interface" | "music", import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptionsWhenChoicesProvided, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
                    required: true;
                    choices: typeof CONST.AUDIO_CHANNELS;
                    initial: string;
                    blank: true;
                }>>>;
                playing: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions>>;
                pausedTime: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
                    min: 0;
                }>;
                repeat: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions>>;
                volume: number;
                fade: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
                    integer: true;
                    min: 0;
                }>;
                sort: number;
                flags: import("fvtt-types/src/foundry/common/data/fields.mjs").DocumentFlagsField._TwoLevelPartial<import("fvtt-types/src/utils/index.mjs").InterfaceToObject<import("fvtt-types/src/foundry/common/abstract/document.mjs").default.CoreFlags>>;
            }, {
                _id: string;
            }>;
            toJSON(): import("fvtt-types/src/utils/index.mjs")._Override<{
                _id: import("fvtt-types/src/foundry/common/data/fields.mjs").DocumentIdField.InitializedType<import("fvtt-types/src/foundry/common/data/fields.mjs").DocumentIdField.DefaultOptions>;
                name: string;
                description: import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<string, import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptions>>, {
                    initial: undefined;
                }>>;
                path: import("fvtt-types/src/foundry/common/data/fields.mjs").FilePathField.InitializedType<{
                    categories: ["AUDIO"];
                }>;
                channel: "" | import("fvtt-types/src/foundry/common/data/fields.mjs").DataField.DerivedInitializedType<"environment" | "interface" | "music", import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.DefaultOptionsWhenChoicesProvided, import("fvtt-types/src/foundry/common/data/fields.mjs").StringField.MergedOptions<{
                    required: true;
                    choices: typeof CONST.AUDIO_CHANNELS;
                    initial: string;
                    blank: true;
                }>>>;
                playing: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions>>;
                pausedTime: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
                    min: 0;
                }>;
                repeat: import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.InitializedType<import("fvtt-types/src/utils/index.mjs").SimpleMerge<import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions, import("fvtt-types/src/foundry/common/data/fields.mjs").BooleanField.DefaultOptions>>;
                volume: number;
                fade: import("fvtt-types/src/foundry/common/data/fields.mjs").NumberField.InitializedType<{
                    integer: true;
                    min: 0;
                }>;
                sort: number;
                flags: import("fvtt-types/src/foundry/common/data/fields.mjs").DocumentFlagsField._TwoLevelPartial<import("fvtt-types/src/utils/index.mjs").InterfaceToObject<import("fvtt-types/src/foundry/common/abstract/document.mjs").default.CoreFlags>>;
            }, {
                _id: string;
            }>;
            parent: Playlist;
            parentCollection: "sounds";
            collection: import("fvtt-types/src/foundry/common/abstract/embedded-collection.mjs").default<import("fvtt-types/src/utils/index.mjs")._Override<PlaylistSound, /*elided*/ any>, Playlist, import("fvtt-types/src/foundry/common/abstract/embedded-collection.mjs").default.Methods<import("fvtt-types/src/utils/index.mjs")._Override<PlaylistSound, /*elided*/ any>>>;
            readonly inCompendium: boolean;
            readonly compendium: CompendiumCollection<"Playlist"> | null;
        }>, undefined>;
    };
    static playSound(playListName: string, soundName: string, broadcast?: boolean): Promise<void | import("fvtt-types/src/foundry/client/audio/sound.mjs").default | null>;
    static ActionTypes(): Record<string, string>;
    static playRandomSound(playListName: string, broadcast?: boolean): Promise<void | import("fvtt-types/src/foundry/client/audio/sound.mjs").default | null>;
    static getSubtype(item?: Item.Implementation): string;
    static getWeaponBaseTypes(): Promise<void>;
    static getItemBaseTypes(type: string, weaponType: string): Promise<{
        [k: string]: string;
    }>;
    static getSpecFor(actorType: string, type: string, subtype: string, weaponSubType: string, selector: string): SoundSpec | undefined;
    static playSpec(spec: SoundSpec, broadcast?: boolean): Promise<void | import("fvtt-types/src/foundry/client/audio/sound.mjs").default | null>;
    static processHook(workflow: Workflow, selector: string): false | Promise<void | import("fvtt-types/src/foundry/client/audio/sound.mjs").default | null>;
    /** The sound settings' spec for a cue's item keys and a selector (itemRoll, attack, hit, a damage type...) */
    static specForCue(cue: Cue, selector: string): SoundSpec | undefined;
    /**
     * M18: the selectors a cue plays, in order, each the first of its alternatives that has a sound (the action type, else
     * "attack"; the damage type, else "damage"). The attack's own sound is with the roll under Dice So Nice, else with its
     * result, as the old hooks played it.
     */
    static selectorsFor(cue: Cue): string[][];
    /** midi's sounds as the default sound presenter: Midi Sound Settings' lookups, played on this client */
    static presenter: Presenter;
    /** M18: the sounds are the default sound presenter (MidiSounds.presenter), on cues; the four hooks are gone */
    static midiSoundsReadyHooks(): void;
    static createDefaultPlayList(): Promise<Playlist.Implementation | undefined>;
    static setupDetailedSounds(): Promise<void>;
    static setupFullSounds(): Promise<void>;
    static setupBasicSounds(): Promise<void>;
}
export {};
