import { debug, i18n, GameSystemConfig } from "../midi-qol.js";
import { configSettings, midiSoundSettings } from "./settings.js";
import { dice3dEnabled } from "./setupModules.js";
import { Workflow } from "./Workflow.js";
 
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

  static async playSound(playListName: string, soundName: string) {
    const { playlist, sound } = this.getSound(playListName, soundName);
    if (playlist && sound?.path) {
        return foundry.audio.AudioHelper.play({ src: sound.path, volume: sound.volume, loop: false }, true);
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
  static async playRandomSound(playListName: string) {
    const playlist: Playlist | undefined = game.playlists?.getName(playListName);
    if (playlist) {
      const sounds = playlist.sounds;
      const soundIndex = Math.floor(Math.random() * sounds.contents.length);
      const sound = sounds.contents[soundIndex];
      return this.playSound(playlist.name, sound.name);
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
      // @ts-expect-error no dnd5e-types
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

  static playSpec(spec: SoundSpec) {
    if (spec.soundName !== "random")
      return this.playSound(spec.playlistName, spec.soundName);
    else
      return this.playRandomSound(spec.playlistName)
  }

  static processHook(workflow: Workflow, selector: string) {
    const subtype = this.getSubtype(workflow.item);
    // @ts-expect-error no dnd5e-types
    const baseType = workflow.item.system.type?.baseItem as string ?? "";
    let spec = this.getSpecFor(workflow.item.parent?.type ?? "all", workflow.item.type ?? "any", subtype, baseType, selector);
    if (!spec) return false;
    return this.playSpec(spec);
  }

  static midiSoundsReadyHooks() {
    Hooks.on("midi-qol.preItemRoll", async (workflow: Workflow) => {
      if (!configSettings.useCustomSounds || !workflow.item) return true;
      await this.processHook(workflow, "itemRoll");
      return true; // sounds can never block roll
    });
    Hooks.on("midi-qol.preAttackRoll", async (workflow: Workflow) => {
      if (!configSettings.useCustomSounds || !workflow.item) return true;
      if (dice3dEnabled() 
        && workflow.activity.hasAttack && !await this.processHook(workflow, workflow.activity.actionType)) {
        await this.processHook(workflow, "attack");
      }
      return true;
    });

    Hooks.on("midi-qol.AttackRollComplete", async (workflow: Workflow) => {
      if (!configSettings.useCustomSounds || !workflow.item) return true;
      if (!dice3dEnabled() 
        && workflow.activity.hasAttack && !await this.processHook(workflow, workflow.activity.actionType)) {
          await this.processHook(workflow, "attack");
      }
      if (workflow.isCritical) {
        await this.processHook(workflow, "critical")
      } else if (workflow.isFumble) {
        await this.processHook(workflow, "fumble")
      } else if (workflow.hitTargets.count === 0) {
        await this.processHook(workflow, "miss")
      } else {
        await this.processHook(workflow, "hit")
      }
      return true;
    });

    Hooks.on("midi-qol.DamageRollComplete", async (workflow: Workflow) => {
      if (!configSettings.useCustomSounds || !workflow.item) return true;
      const result = await this.processHook(workflow, workflow.defaultDamageType);
      if (!result)
        await this.processHook(workflow, "damage");
      return true;
    });
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