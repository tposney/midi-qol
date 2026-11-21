import { debug, i18n, GameSystemConfig } from "../midi-qol.js";
import { configSettings, midiSoundSettings } from "./settings.js";
import { dice3dEnabled } from "./setupModules.js";
import type { Cue } from "./lib/cues.js";
import type { Workflow } from "./Workflow.js";
import { register as registerPresenter } from "./api/services.js";
import type { Presenter } from "./services/presenters/service.js";
 
interface SoundSpec {
  playlistName: string;
  soundName: string;
};
export class MidiSounds {
  static weaponBaseTypes: {};

  static getSound(playListName: string, soundName: string) {
    const playlist: Playlist.Implementation | undefined = game.playlists?.getName(playListName);
    return { playlist, sound: playlist?.sounds.getName(soundName) };
  }

  static async playSound(playListName: string, soundName: string, broadcast = true) {
    const { playlist, sound } = this.getSound(playListName, soundName);
    if (playlist && sound?.path) {
        return foundry.audio.AudioHelper.play({ src: sound.path, volume: sound.volume, loop: false }, broadcast);
    }
    return null;
  }

  static ActionTypes(): Record<string, string> {
    const damageEntries = Object.fromEntries(Object.entries(GameSystemConfig.damageTypes as Record<string, {label: string}>).map(([key, {label}]) => [key, `${i18n("DND5E.Damage")}: ${label}`]));
    const itemActionEntries = Object.fromEntries(Object.entries(GameSystemConfig.itemActionTypes as Record<string, string>).map(([key, label]) => [key, `${i18n("DND5E.Action")}: ${label}`]));

    return {
      itemRoll: `${i18n("DOCUMENT.Item")} ${i18n("TABLE.Roll")}`,
      attack: i18n("DND5E.AttackRoll"),
      damage: i18n("DND5E.DamageRoll"),
      critical: `${i18n("DND5E.Attack")}: ${i18n("midi-qol.CriticalSoundName")}`,
      fumble: `${i18n("DND5E.Attack")}: ${i18n("midi-qol.FumbleSoundName")}`,
      hit: `${i18n("DND5E.Attack")}: ${i18n("midi-qol.Hits")}`,
      miss: `${i18n("DND5E.Attack")}: ${i18n("midi-qol.Misses")}`,
      none: i18n("None"),
      ...itemActionEntries,
      ...damageEntries,
    };
  }
  static async playRandomSound(playListName: string, broadcast = true) {
    const playlist: Playlist | undefined = game.playlists?.getName(playListName);
    if (playlist) {
      const sounds = playlist.sounds;
      const soundIndex = Math.floor(Math.random() * sounds.contents.length);
      const sound = sounds.contents[soundIndex];
      return this.playSound(playlist.name, sound.name, broadcast);
    }
    return null;
  }

  static getSubtype(item?: Item.Implementation): string {
    if (!item?.type) return "";
    let subtype = "";
    switch (item.type) {
      // @ts-expect-error no dnd5e-types
      case "weapon": subtype = "weapon." + item.system.type.value; break;
      // @ts-expect-error no dnd5e-types
      case "equipment": subtype = "equipment." + item.system.type.value; break;
      // @ts-expect-error no dnd5e-types
      case "consumable": subtype = "consumable." + item.system.type.value; break;
      // @ts-expect-error no dnd5e-types
      case "spell": subtype = "spell." + item.system.school; break;
      // @ts-expect-error no dnd5e-types
      case "tool": subtype = "tool." + item.system.type.value; break;
      default: subtype = item.type + "any";
    }
    return subtype;
  }

  static async getWeaponBaseTypes() {
    MidiSounds.weaponBaseTypes = {};
    const packname = GameSystemConfig.sourcePacks.ITEMS;
    if (packname) {
      const packObject = game.packs?.get(packname);
      await packObject?.getIndex({ fields: ["system.armor.type", "system.toolType", "system.weaponType", "img"] });

      const weaponTypes = Object.keys(GameSystemConfig.weaponTypes);
      for (const wt of weaponTypes) {
        const baseTypes = await MidiSounds.getItemBaseTypes("weapon", wt);
        foundry.utils.mergeObject(MidiSounds.weaponBaseTypes, baseTypes)
      }
    }
    debug("Weapon base types are ", MidiSounds.weaponBaseTypes);
  }

  static async getItemBaseTypes(type: string, weaponType: string) {
    const baseIds = GameSystemConfig[`${type}Ids`];
    if (baseIds === undefined) return {};

    const typeProperty = `type.value`;
    const baseType = weaponType;

    const items: Record<string, string> = {};
    for (const [name, id] of Object.entries(baseIds)) {
      let baseItem = await globalThis.dnd5e.documents.Trait.getBaseItem(id);
      if (baseType !== baseItem && foundry.utils.getProperty(baseItem.system, typeProperty)) continue;
      items[name] = baseItem?.name;
    }
    const result =  Object.fromEntries(Object.entries(items).sort((lhs, rhs) => lhs[1].localeCompare(rhs[1])));
    return result;
  }

  static getSpecFor(actorType: string, type: string, subtype: string, weaponSubType: string, selector: string) {
    let spec: SoundSpec | undefined;
    for (let aType of [actorType, "any"]) {
      let specs = foundry.utils.getProperty(midiSoundSettings, aType) ?? {};
      if (!spec) spec = foundry.utils.getProperty(specs, `weapon.${weaponSubType}.${selector}`) as SoundSpec;
      if (!spec) spec = foundry.utils.getProperty(specs, `${subtype}.${selector}`) as SoundSpec;
      if (!spec) spec = foundry.utils.getProperty(specs, `${type}.any.${selector}`) as SoundSpec;
      if (!spec) spec = foundry.utils.getProperty(specs, `all.any.${selector}`) as SoundSpec;
      if (spec) return spec;
    }
    return undefined;
  }

  static playSpec(spec: SoundSpec, broadcast = true) {
    if (spec.soundName !== "random")
      return this.playSound(spec.playlistName, spec.soundName, broadcast);
    else
      return this.playRandomSound(spec.playlistName, broadcast)
  }

  static processHook(workflow: Workflow, selector: string) {
    const subtype = this.getSubtype(workflow.item);
    // @ts-expect-error no dnd5e-types
    const baseType = workflow.item.system.type?.baseItem as string ?? "";
    let spec = this.getSpecFor(workflow.item.parent?.type ?? "all", workflow.item.type ?? "any", subtype, baseType, selector);
    if (!spec) return false;
    return this.playSpec(spec);
  }

  /** The sound settings' spec for a cue's item keys and a selector (itemRoll, attack, hit, a damage type...) */
  static specForCue(cue: Cue, selector: string): SoundSpec | undefined {
    const keys = cue.sound;
    return this.getSpecFor(keys.actorType ?? "all", keys.itemType ?? "any", keys.subtype ?? "", keys.baseItem ?? "", selector);
  }

  /**
   * M18: the selectors a cue plays, in order, each the first of its alternatives that has a sound (the action type, else
   * "attack"; the damage type, else "damage"). The attack's own sound is with the roll under Dice So Nice, else with its
   * result, as the old hooks played it.
   */
  static selectorsFor(cue: Cue): string[][] {
    const attack = [cue.tags.actionType ?? "", "attack"].filter(Boolean);
    switch (cue.cue) {
      case "use.start": return [["itemRoll"]];
      case "attack.roll": return dice3dEnabled() ? [attack] : [];
      case "attack.hit": case "attack.miss": case "attack.critical": case "attack.fumble":
        return [...(dice3dEnabled() ? [] : [attack]), [cue.cue.slice("attack.".length)]];
      case "damage.rolled": return [[cue.tags.defaultDamageType ?? "", "damage"].filter(Boolean)];
      default: return [];
    }
  }

  /** midi's sounds as the default sound presenter: Midi Sound Settings' lookups, played on this client */
  static presenter: Presenter = {
    channel: "sound",
    claims: cue => {
      if (!configSettings.useCustomSounds) return false;
      if (typeof cue.presentation?.sound === "object") return true;
      return MidiSounds.selectorsFor(cue).some(alternatives => alternatives.some(selector => MidiSounds.specForCue(cue, selector)));
    },
    play: async cue => {
      const override = cue.presentation?.sound;
      if (override && typeof override === "object") return MidiSounds.playSpec({ playlistName: override.playlist, soundName: override.sound }, false);
      for (const alternatives of MidiSounds.selectorsFor(cue)) {
        const spec = alternatives.map(selector => MidiSounds.specForCue(cue, selector)).find(Boolean);
        if (spec) await MidiSounds.playSpec(spec, false);
      }
    }
  };

  /** M18: the sounds are the default sound presenter (MidiSounds.presenter), on cues; the four hooks are gone */
  static midiSoundsReadyHooks() {
    registerPresenter("presenters", "midi-qol.sounds", MidiSounds.presenter, { label: "Midi-QOL: Midi Sound Settings", priority: -10 });
  }

  static async createDefaultPlayList(): Promise<Playlist.Implementation | undefined> {
    if (!game.user?.isGM) {
      ui.notifications?.warn("Only a GM can create the default playlist");
      return;
    }
    if (game.playlists?.getName("Midi Item Tracks") !== undefined) {
      ui.notifications?.error("Midi Item Tracks already exists - delete it before creating the default playlist");
      return;
    }
    const playlistData: Playlist.CreateData = {
      name: "Midi Item Tracks",
      description: "Midi Qol sample custom sounds",
      mode: CONST.PLAYLIST_MODES.DISABLED,
      sounds: [
        {
          path: "modules/midi-qol/sounds/success-drums.ogg",
          repeat: false,
          volume: 0.125,
          name: "success-drums",
          playing: false,
          pausedTime: null,
          sort: 0
        },
        {
          name: "dice",
          description: "",
          path: "sounds/dice.wav",
          playing: false,
          pausedTime: null,
          repeat: false,
          volume: 0.5240467536394058,
          sort: 0,
        },
        {
          name: "drink",
          description: "",
          path: "modules/midi-qol/sounds/drink.wav",
          playing: false,
          pausedTime: null,
          repeat: false,
          volume: 0.5240467536394058,
          sort: 0,
        },
        {
          name: "fail1",
          description: "",
          path: "modules/midi-qol/sounds/fail1.wav",
          playing: false,
          pausedTime: null,
          repeat: false,
          volume: 0.5240467536394058,
          sort: 0,
        },
        {
          name: "fail2",
          description: "",
          path: "modules/midi-qol/sounds/fail2.wav",
          playing: false,
          pausedTime: null,
          repeat: false,
          volume: 0.5240467536394058,
          sort: 0,
        },
        {
          name: "good-results",
          description: "",
          path: "modules/midi-qol/sounds/good-results.ogg",
          playing: false,
          pausedTime: null,
          repeat: false,
          volume: 0.5240467536394058,
          sort: 0,
        },
        {
          name: "spell",
          description: "",
          path: "modules/midi-qol/sounds/spell.wav",
          playing: false,
          pausedTime: null,
          repeat: false,
          volume: 0.5240467536394058,
          sort: 0,
        },
        {
          name: "success",
          description: "",
          path: "modules/midi-qol/sounds/success.wav",
          playing: false,
          pausedTime: null,
          repeat: false,
          volume: 0.5240467536394058,
          sort: 0,
        },
        {
          name: "swing",
          description: "",
          path: "modules/midi-qol/sounds/swing.wav",
          playing: false,
          pausedTime: null,
          repeat: false,
          volume: 0.5240467536394058,
          sort: 0,
        },
        {
          name: "use",
          description: "",
          path: "modules/midi-qol/sounds/use.wav",
          playing: false,
          pausedTime: null,
          repeat: false,
          volume: 0.5240467536394058,
          sort: 0,
        },
        {
          name: "fail3",
          description: "",
          path: "modules/midi-qol/sounds/fail3.ogg",
          playing: false,
          pausedTime: null,
          repeat: false,
          volume: 0.5240467536394058,
          sort: 0,
        },
        {
          name: "bowshot",
          description: "",
          path: "modules/midi-qol/sounds/bow-and-arrow.mp3",
          playing: false,
          pausedTime: null,
          repeat: false,
          volume: 0.5240467536394058,
          sort: 0,
        }
      ]
    };
    return Playlist.create(playlistData, {});
  }

  static async setupDetailedSounds() {
    const soundSettings = {
      version: "0.9.48",
      any: {
        all: {
          any: {
            itemRoll: { playlistName: "Midi Item Tracks", soundName: "dice" },
            attack: { playlistName: "Midi Item Tracks", soundName: "dice" },
            damage: { playlistName: "Midi Item Tracks", soundName: "dice" },
            critical: { playlistName: "Midi Item Tracks", soundName: "success-drums" },
            fumble: { playlistName: "Midi Item Tracks", soundName: "fail1" },
            mwak: { playlistName: "Midi Item Tracks", soundName: "swing" },
            rwak: { playlistName: "Midi Item Tracks", soundName: "bowshot" },
            rsak: { playlistName: "Midi Item Tracks", soundName: "spell" },
            msak: { playlistName: "Midi Item Tracks", soundName: "spell" },
          }
        },
        consumable: {
          ammo: {
            itemRoll: { playlistName: "Midi Item Tracks", soundName: "none" }
          },
          food: {
            itemRoll: { playlistName: "Midi Item Tracks", soundName: "drink" },
          },
          poison: {
            itemRoll: { playlistName: "Midi Item Tracks", soundName: "drink" },
          },
          potion: {
            itemRoll: { playlistName: "Midi Item Tracks", soundName: "drink" },
          },
          rod: {
            itemRoll: { playlistName: "Midi Item Tracks", soundName: "spell" },
          },
          scroll: {
            itemRoll: { playlistName: "Midi Item Tracks", soundName: "spell" },
          },
          trinket: {
            itemRoll: { playlistName: "Midi Item Tracks", soundName: "use" },
          },
          wand: {
            itemRoll: { playlistName: "Midi Item Tracks", soundName: "spell" },
          },
        },
        weapon: {
          any: {
            itemRoll: { playlistName: "Midi Item Tracks", soundName: "none" },
            mwak: { playlistName: "Midi Item Tracks", soundName: "swing" },
            rwak: { playlistName: "Midi Item Tracks", soundName: "bowshot" },
            rsak: { playlistName: "Midi Item Tracks", soundName: "spell" },
            msak: { playlistName: "Midi Item Tracks", soundName: "spell" },
          }
        },
        spell: {
          any: {
            itemRoll: { playlistName: "Midi Item Tracks", soundName: "none" },
            mwak: { playlistName: "Midi Item Tracks", soundName: "swing" },
            rwak: { playlistName: "Midi Item Tracks", soundName: "bowshot" },
            rsak: { playlistName: "Midi Item Tracks", soundName: "spell" },
            msak: { playlistName: "Midi Item Tracks", soundName: "spell" },
          }
        },
        feat: {
          any: {
            itemRoll: { playlistName: "Midi Item Tracks", soundName: "use" }
          },
        },
        tool: {
          any: {
            itemRoll: { playlistName: "Midi Item Tracks", soundName: "use" }
          }
        }
      }
    }
    if (game.user?.can("SETTINGS_MODIFY")) await game.settings.set("midi-qol", "MidiSoundSettings", soundSettings);
  }
  static async setupFullSounds() {
    const soundSettings = {
      version: "0.9.48",
      any: {
        all: {
          any: {
            itemRoll: { playlistName: "Midi Item Tracks", soundName: "dice" },
            attack: { playlistName: "Midi Item Tracks", soundName: "dice" },
            damage: { playlistName: "Midi Item Tracks", soundName: "dice" },
            critical: { playlistName: "Midi Item Tracks", soundName: "success-drums" },
            fumble: { playlistName: "Midi Item Tracks", soundName: "fail1" },
            hit: { playlistName: "Midi Item Tracks", soundName: "none" },
            miss: { playlistName: "Midi Item Tracks", soundName: "none" },
            abil: { playlistName: "Midi Item Tracks", soundName: "dice" },
            heal: { playlistName: "Midi Item Tracks", soundName: "dice" },
            msak: { playlistName: "Midi Item Tracks", soundName: "dice" },
            mwak: { playlistName: "Midi Item Tracks", soundName: "dice" },
            other: { playlistName: "Midi Item Tracks", soundName: "dice" },
            rsak: { playlistName: "Midi Item Tracks", soundName: "dice" },
            rwak: { playlistName: "Midi Item Tracks", soundName: "dice" },
            save: { playlistName: "Midi Item Tracks", soundName: "dice" },
            util: { playlistName: "Midi Item Tracks", soundName: "dice" },
            acid: { playlistName: "Midi Item Tracks", soundName: "dice" },
            bludgeoning: { playlistName: "Midi Item Tracks", soundName: "dice" },
            cold: { playlistName: "Midi Item Tracks", soundName: "dice" },
            fire: { playlistName: "Midi Item Tracks", soundName: "dice" },
            force: { playlistName: "Midi Item Tracks", soundName: "dice" },
            lightning: { playlistName: "Midi Item Tracks", soundName: "dice" },
            "midi-none": { playlistName: "Midi Item Tracks", soundName: "dice" },
            necrotic: { playlistName: "Midi Item Tracks", soundName: "dice" },
            piercing: { playlistName: "Midi Item Tracks", soundName: "dice" },
            poison: { playlistName: "Midi Item Tracks", soundName: "dice" },
            psychic: { playlistName: "Midi Item Tracks", soundName: "dice" },
            radiant: { playlistName: "Midi Item Tracks", soundName: "dice" },
            slashing: { playlistName: "Midi Item Tracks", soundName: "dice" },
            thunder: { playlistName: "Midi Item Tracks", soundName: "dice" },
          }
        },
        consumable: {
          ammo: {
            itemRoll: { playlistName: "Midi Item Tracks", soundName: "none" }
          },
          food: {
            itemRoll: { playlistName: "Midi Item Tracks", soundName: "drink" },
          },
          poison: {
            itemRoll: { playlistName: "Midi Item Tracks", soundName: "drink" },
          },
          potion: {
            itemRoll: { playlistName: "Midi Item Tracks", soundName: "drink" },
          },
          rod: {
            itemRoll: { playlistName: "Midi Item Tracks", soundName: "spell" },
          },
          scroll: {
            itemRoll: { playlistName: "Midi Item Tracks", soundName: "spell" },
          },
          trinket: {
            itemRoll: { playlistName: "Midi Item Tracks", soundName: "use" },
          },
          wand: {
            itemRoll: { playlistName: "Midi Item Tracks", soundName: "spell" },
          },
        },
        weapon: {
          any: {
            itemRoll: { playlistName: "Midi Item Tracks", soundName: "none" },
            abil: { playlistName: "Midi Item Tracks", soundName: "swing" },
            heal: { playlistName: "Midi Item Tracks", soundName: "spell" },
            msak: { playlistName: "Midi Item Tracks", soundName: "spell" },
            mwak: { playlistName: "Midi Item Tracks", soundName: "swing" },
            other: { playlistName: "Midi Item Tracks", soundName: "swing" },
            rsak: { playlistName: "Midi Item Tracks", soundName: "spell" },
            rwak: { playlistName: "Midi Item Tracks", soundName: "bowshot" },
            save: { playlistName: "Midi Item Tracks", soundName: "swing" },
            util: { playlistName: "Midi Item Tracks", soundName: "swing" },
            damage: { playlistName: "Midi Item Tracks", soundName: "dice" },
            critical: { playlistName: "Midi Item Tracks", soundName: "success-drums" },
            fumble: { playlistName: "Midi Item Tracks", soundName: "fail1" },
            hit: { playlistName: "Midi Item Tracks", soundName: "none" },
            miss: { playlistName: "Midi Item Tracks", soundName: "none" },
          }
        },
        spell: {
          any: {
            itemRoll: { playlistName: "Midi Item Tracks", soundName: "spell" },
            abil: { playlistName: "Midi Item Tracks", soundName: "spell" },
            heal: { playlistName: "Midi Item Tracks", soundName: "spell" },
            msak: { playlistName: "Midi Item Tracks", soundName: "spell" },
            mwak: { playlistName: "Midi Item Tracks", soundName: "swing" },
            other: { playlistName: "Midi Item Tracks", soundName: "spell" },
            rsak: { playlistName: "Midi Item Tracks", soundName: "spell" },
            rwak: { playlistName: "Midi Item Tracks", soundName: "bowshot" },
            save: { playlistName: "Midi Item Tracks", soundName: "spell" },
            util: { playlistName: "Midi Item Tracks", soundName: "spell" },
            critical: { playlistName: "Midi Item Tracks", soundName: "success-drums" },
            fumble: { playlistName: "Midi Item Tracks", soundName: "fail1" },
            hit: { playlistName: "Midi Item Tracks", soundName: "none" },
            miss: { playlistName: "Midi Item Tracks", soundName: "none" },
          }
        },
        feat: {
          any: {
            itemRoll: { playlistName: "Midi Item Tracks", soundName: "use" },
            abil: { playlistName: "Midi Item Tracks", soundName: "none" },
            heal: { playlistName: "Midi Item Tracks", soundName: "none" },
            msak: { playlistName: "Midi Item Tracks", soundName: "spell" },
            mwak: { playlistName: "Midi Item Tracks", soundName: "swing" },
            other: { playlistName: "Midi Item Tracks", soundName: "none" },
            rsak: { playlistName: "Midi Item Tracks", soundName: "spell" },
            rwak: { playlistName: "Midi Item Tracks", soundName: "bowshot" },
            save: { playlistName: "Midi Item Tracks", soundName: "spell" },
            util: { playlistName: "Midi Item Tracks", soundName: "none" },
            critical: { playlistName: "Midi Item Tracks", soundName: "success-drums" },
            fumble: { playlistName: "Midi Item Tracks", soundName: "fail1" },
            hit: { playlistName: "Midi Item Tracks", soundName: "none" },
            miss: { playlistName: "Midi Item Tracks", soundName: "none" },
          }
        },
        tool: {
          any: {
            itemRoll: { playlistName: "Midi Item Tracks", soundName: "use" },
            critical: { playlistName: "Midi Item Tracks", soundName: "success-drums" },
            fumble: { playlistName: "Midi Item Tracks", soundName: "fail1" },
          }
        }
      }
    }
    if (game.user?.can("SETTINGS_MODIFY")) await game.settings.set("midi-qol", "MidiSoundSettings", soundSettings);
  }
  static async setupBasicSounds() {
    const soundSettings: any = {
      version: "0.9.48",
      any: {
        all: {
          any: {
            itemRoll: { playlistName: "Midi Item Tracks", soundName: "dice" },
            attack: { playlistName: "Midi Item Tracks", soundName: "dice" },
            damage: { playlistName: "Midi Item Tracks", soundName: "dice" },
            critical: { playlistName: "Midi Item Tracks", soundName: "success-drums" },
            fumble: { playlistName: "Midi Item Tracks", soundName: "fail1" },
            mwak: { playlistName: "Midi Item Tracks", soundName: "swing" },
            rwak: { playlistName: "Midi Item Tracks", soundName: "bowshot" },
            rsak: { playlistName: "Midi Item Tracks", soundName: "spell" },
            msak: { playlistName: "Midi Item Tracks", soundName: "spell" },
          }
        },
        consumable: {
          ammo: {
            itemRoll: { playlistName: "Midi Item Tracks", soundName: "none" }
          },
          food: {
            itemRoll: { playlistName: "Midi Item Tracks", soundName: "drink" },
          },
          poison: {
            itemRoll: { playlistName: "Midi Item Tracks", soundName: "drink" },
          },
          potion: {
            itemRoll: { playlistName: "Midi Item Tracks", soundName: "drink" },
          },
          rod: {
            itemRoll: { playlistName: "Midi Item Tracks", soundName: "spell" },
          },
          scroll: {
            itemRoll: { playlistName: "Midi Item Tracks", soundName: "spell" },
          },
          trinket: {
            itemRoll: { playlistName: "Midi Item Tracks", soundName: "use" },
          },
          wand: {
            itemRoll: { playlistName: "Midi Item Tracks", soundName: "spell" },
          },
        },
        tool: {
          any: {
            itemRoll: { playlistName: "Midi Item Tracks", soundName: "use" }
          }
        }
      }
    }
    if (game.user?.can("SETTINGS_MODIFY")) await game.settings.set("midi-qol", "MidiSoundSettings", soundSettings);
  }
}