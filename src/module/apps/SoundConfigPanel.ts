import { geti18nOptions, i18n } from "../../midi-qol.js";
import { MidiSounds } from "../midi-sounds.js";
import { configSettings, midiSoundSettings } from "../settings.js";
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class SoundConfigPanel extends HandlebarsApplicationMixin(ApplicationV2) {
  static defaultPlaylist: string | undefined;
  static defaultSound: string | undefined;
  constructor(options?) {
    super(options);
    if (!configSettings.useCustomSounds) {
      ui.notifications?.warn("Use Custom Sounds Not enabled - changes will have no effect", {permanent: true})
    }
  }
  
  get title() {
    return i18n("midi-qol.ConfigTitle") ?? "Sound Config";
  }

  static DEFAULT_OPTIONS = foundry.utils.mergeObject(super.DEFAULT_OPTIONS, {
    id: "midi-qol-sound-config",
    window: {
      title: "midi-qol.SoundSettings.Name",
      resizable: true
    },
    position: {
      height: "auto" as "auto",
      width: 900
    },
    actions: {
      add: this.#onAdd,
      delete: this.#onDelete
    },
    form: {
      submitOnChange: true,
      handler: this.#onSubmit as any
    },
    tag: "form"
  }, { inplace: false });

  static PARTS = {
    tabs: {template: "templates/generic/tab-navigation.hbs"},
    sounds: {template: "modules/midi-qol/templates/sounds/sounds.hbs"},
    quick: {template: "modules/midi-qol/templates/sounds/quick.hbs"}
  }

  tabGroups = {
    sheet: "sounds"
  }

  async _prepareContext(options) {
    const context: any = await super._prepareContext(options);
    // @ts-expect-error
    const systemConfig = (game.system?.id === "dnd5e") ? CONFIG.DND5E : CONFIG.SW5E;
    const consumableSubtypesData = Object.keys(systemConfig.consumableTypes).reduce((obj, key) => {obj[key] = systemConfig.consumableTypes[key].label; return obj}, {});
    const spellSchoolData = Object.keys(systemConfig.spellSchools).reduce((obj, key) => {obj[key] = systemConfig.spellSchools[key].label; return obj}, {});  
    const itemTypes: any = foundry.utils.duplicate(CONFIG.Item.typeLabels);
    delete itemTypes.backpack;
    delete itemTypes.class;
    itemTypes.all = "All";
    itemTypes.none = "None";
    context.weaponSubtypes = foundry.utils.mergeObject({any: "Any", none: "None"}, systemConfig.weaponTypes);
    context.weaponSubtypes = foundry.utils.mergeObject(context.weaponSubtypes, MidiSounds.weaponBaseTypes);
    context.equipmentSubtypes = foundry.utils.mergeObject({any: "Any"}, systemConfig.equipmentTypes);
    context.consumableSubTypes = foundry.utils.mergeObject({any: "Any"}, consumableSubtypesData);
    context.spellSubtypes = foundry.utils.mergeObject({any: "Any"}, spellSchoolData);
    context.toolSubtypes = foundry.utils.mergeObject({any: "Any"}, systemConfig.toolTypes);
    context.defaultSubtypes = {any: "Any"};
    context.characterTypes = {any: "Any", npc: "NPC", character: "Character", "none": "None"};
    context.subTypes = {
      "weapon": context.weaponSubtypes,
      "equipment": context.equipmentSubtypes,
      "consumable": context.consumableSubTypes,
      "spell": context.spellSubtypes,
      "tool": context.toolSubtypes,
      "feat" : {any: "Any"},
      "all": context.defaultSubtypes,
      "none": {none: "None"},
      "base": {none: "None"}
    }
    context.itemTypes = Object.keys(itemTypes).reduce((list, key) => {list[key] = i18n(itemTypes[key]); return list}, {});
    context.midiSoundSettings = foundry.utils.duplicate(midiSoundSettings);
    context.SoundSettingsBlurb = geti18nOptions("SoundSettingsBlurb");
    context.quickSettingsOptions = {createPlaylist: "Create Sample Playlist", basic: "Basic Settings", detailed: "Detailed Settings", full: "Full Settings"};
    context.playlists = game.playlists?.reduce((acc, pl:any) => {
      acc[pl.name] = pl.sounds.reduce((list, sound) => {
        list[sound.name] = sound.name; return list}, {}); 
      acc[pl.name].none = "none";
      acc[pl.name].random = "random";
      return acc;
    }, {});
    context.actionTypes = MidiSounds.ActionTypes();
    context.tabs = this.#getTabs();
    SoundConfigPanel.defaultPlaylist = Object.keys(context.playlists ?? {})[0];
    SoundConfigPanel.defaultSound = Object.keys(context.playlists[SoundConfigPanel.defaultPlaylist])[0];
    return context;
  }

  #getTabs() {
    const tabs = {
      sounds: {id: "sounds", group: "sheet", label: "midi-qol.SoundSettings.Name", active: true},
      quick: {id: "quick", group: "sheet", label: "midi-qol.Config.Tabs.quick"}
    };
    return tabs;
  }

  async _preparePartContext(partId, context) {
    if (Object.keys(context.tabs).includes(partId)) {
      context.tab = context.tabs[partId];
    }
    return context;
  }

  static async #onAdd(event, target) {
    if (!SoundConfigPanel.defaultPlaylist) return;
    if (!game.user?.can("SETTINGS_MODIFY")) return;
    event.preventDefault();
    const formData: any = new FormDataExtended(target.form)?.object;
    for (let key of ["chartype", "action", "category", "playlistName", "soundName", "subtype"]) {
      if (!formData[key]) formData[key] = [];
      if (typeof formData[key] === "string") formData[key] = [formData[key]];
      if (key !== "playlistName") formData[key].push("none");
      else formData[key].push(SoundConfigPanel.defaultPlaylist);
    }
    const settings: any = {};
    if (formData.chartype) {
      if (typeof formData.chartype === "string") {
        for (let key of ["chartype", "action", "category", "playlistName", "soundName", "subtype"]) {
          formData[key] = [formData[key]];
        }
      }
      for (let i = 0; i < (formData.chartype?.length ?? 0); i++) {
        const chartype = formData.chartype[i];
        const category = formData.category[i];
        const subtype = formData.subtype[i];
        const action = formData.action[i];
        const playlistName = formData.playlistName[i];
        const soundName = formData.soundName[i];
        if (!settings[chartype]) settings[chartype] = {};
        if (!settings[chartype][category]) settings[chartype][category] = {};
        if (!settings[chartype][category][subtype]) settings[chartype][category][subtype] = {};
        settings[chartype][category][subtype][action] = { playlistName, soundName };
      }
    }
    settings.version = "0.9.48";
    // @ts-expect-error
    await game.settings?.set("midi-qol", "MidiSoundSettings", settings);
    // @ts-expect-error
    this.render({force: true});
  }

  static #onDelete(event, target) {
    event.preventDefault();
    const rowTarget = target.closest("tr");
    rowTarget.remove();
    event.currentTarget.requestSubmit();
  }

  static async #onSubmit(event, form, formDataIn) {
    if (!game.user?.can("SETTINGS_MODIFY")) return;
    const formData = formDataIn.object;
    if (!game.user?.can("SETTINGS_MODIFY")) return;
    const settings: any = {};
    if (formData.chartype) {
      if (typeof formData.chartype === "string") {
        for (let key of ["chartype", "action", "category", "playlistName", "soundName", "subtype"]) {
          formData[key] = [formData[key]];
        }
      }
      for (let i = 0; i < (formData.chartype?.length ?? 0); i++) {
        const chartype = formData.chartype[i];
        const category = formData.category[i];
        const subtype = formData.subtype[i];
        const action = formData.action[i];
        const playlistName = formData.playlistName[i];
        const soundName = formData.soundName[i];
        if (!settings[chartype]) settings[chartype] = {};
        if (!settings[chartype][category]) settings[chartype][category] = {};
        if (!settings[chartype][category][subtype]) settings[chartype][category][subtype] = {};
        settings[chartype][category][subtype][action] = { playlistName, soundName };
      }
    }
    settings.version = "0.9.48";
    // @ts-expect-error
    await game.settings?.set("midi-qol", "MidiSoundSettings", settings);
    // @ts-expect-error
    this.render({force: true});
  }

  _onRender(context, options) {
    super._onRender(context, options);
    // html.find(".soundName").change(function (event) {
    //   this.submit({ preventClose: true }).then(() => this.render());
    // }.bind(this));
    // html.find(".playlistName").change(function (event) {
    //   this.submit({ preventClose: true }).then(() => this.render());
    // }.bind(this));
    // html.find(".category").change(function (event) {
    //   this.submit({ preventClose: true }).then(() => this.render());
    // }.bind(this));
    // html.find(".action").change(function (event) {
    //   this.submit({ preventClose: true }).then(() => this.render());
    // }.bind(this));
    // html.find(".subtype").change(function (event) {
    //   this.submit({ preventClose: true }).then(() => this.render());
    // }.bind(this))
    for (const elem of Array.from(this.element.querySelectorAll(".import-quick-setting"))) {
      elem.addEventListener("click", function(event) {
        const key = event.currentTarget?.id;
        switch (key) {
          case "createPlaylist": MidiSounds.createDefaultPlayList().then(() => this.render(true)); break
          case "basic": MidiSounds.setupBasicSounds().then(() => this.render(true)); break;
          case "detailed": MidiSounds.setupDetailedSounds().then(() => this.render(true)); break;
          case "full": MidiSounds.setupFullSounds().then(() => this.render(true)); break;
        }
      }.bind(this));
    }
  }
}