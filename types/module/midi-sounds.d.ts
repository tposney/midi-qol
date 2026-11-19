import { Workflow } from "./Workflow.js";
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
    static playSound(playListName: string, soundName: string): Promise<void | import("fvtt-types/src/foundry/client/audio/sound.mjs").default | null>;
    static ActionTypes(): Record<string, string>;
    static playRandomSound(playListName: string): Promise<void | import("fvtt-types/src/foundry/client/audio/sound.mjs").default | null>;
    static getSubtype(item?: Item.Implementation): string;
    static getWeaponBaseTypes(): Promise<void>;
    static getItemBaseTypes(type: string, weaponType: string): Promise<{
        [k: string]: string;
    }>;
    static getSpecFor(actorType: string, type: string, subtype: string, weaponSubType: string, selector: string): SoundSpec | undefined;
    static playSpec(spec: SoundSpec): Promise<void | import("fvtt-types/src/foundry/client/audio/sound.mjs").default | null>;
    static processHook(workflow: Workflow, selector: string): false | Promise<void | import("fvtt-types/src/foundry/client/audio/sound.mjs").default | null>;
    static midiSoundsReadyHooks(): void;
    static createDefaultPlayList(): Promise<Playlist.Implementation | undefined>;
    static setupDetailedSounds(): Promise<void>;
    static setupFullSounds(): Promise<void>;
    static setupBasicSounds(): Promise<void>;
}
export {};
