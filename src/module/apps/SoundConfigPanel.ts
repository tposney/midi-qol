import { geti18nOptions, i18n } from "../../midi-qol.js";
import { MidiSounds } from "../midi-sounds.js";
import { configSettings, midiSoundSettings } from "../settings.js";

export class SoundConfigPanel extends FormApplication {

  constructor(...args) {
    super(args);
    if (!configSettings.useCustomSounds) {
      ui.notifications?.warn("Use Custom Sounds Not enabled - changes will have no effect", {permanent: true})
    }
  }
  
  get title() {
    return i18n("midi-qol.ConfigTitle")
  }

  static get defaultOptions(): any {
    return mergeObject(super.defaultOptions, {
      id: "midi-qol-sound-config",
      tabs: [{ navSelector: ".tabs", contentSelector: ".content", initial: "sounds" }],
      classes: ["dnd5e"],
      title: "Sound Config",
      template: "modules/midi-qol/templates/sound-config.html",
      height: "auto",
      choices: {},
      allowCustom: false,
      width: "auto",
      minimum: 0,
      maximum: null,
      submitOnClose: false, 
      resizable: true
    });
  }

  getData(options) {
    let data:any = super.getData(options)
    //@ts-ignore
    let systemConfig = (game.system.id === "dnd5e") ? CONFIG.DND5E :  CONFIG.SW5E;
    data.weaponSubtypes = mergeObject({any: "Any", none: "None"}, systemConfig.weaponTypes);
    data.weaponSubtypes = mergeObject(data.weaponSubtypes, MidiSounds.weaponBaseTypes);
    data.equipmentSubtypes = mergeObject({any: "Any"}, systemConfig.equipmentTypes);
    data.consumableSubTypes = mergeObject({any: "Any"}, systemConfig.consumableTypes);
    data.spellSubtypes = mergeObject({any: "Any"}, systemConfig.spellSchools);
    data.toolSubtypes = mergeObject({any: "Any"}, systemConfig.toolTypes);
    data.defaultSubtypes = {any: "Any"};
    data.characterTypes = {any: "Any", npc: "NPC", character: "Character", "none": "None"};
    data.subTypes = {
      "weapon": data.weaponSubtypes,
      "equipment": data.equipmentSubtypes,
      "consumable": data.consumableSubTypes,
      "spell": data.spellSubtypes,
      "tool": data.toolSubtypes,
      "feat" : {any: "Any"},
      "all": data.defaultSubtypes,
      "none": {none: "None"}
    }

    const itemTypes = duplicate(CONFIG.Item.typeLabels);
    delete itemTypes.backpack;
    delete itemTypes.class;
    itemTypes.all = "All";
    itemTypes.none = "None";
    
    data.itemTypes = Object.keys(itemTypes).reduce((list, key) => {list[key] = i18n(itemTypes[key]); return list}, {});
    data.midiSoundSettings = duplicate(midiSoundSettings);
    data.SoundSettingsBlurb = geti18nOptions("SoundSettingsBlurb");
    data.quickSettingsOptions = {createPlaylist: "Create Sample Playlist", basic: "Basic Settings", detailed: "Detailed Settings", full: "Full Settings"};
    data.playlists = game.playlists?.reduce((acc, pl:any) => {
      acc[pl.name] = pl.sounds.reduce((list, sound) => {
        list[sound.name] = sound.name; return list}, {}); 
      acc[pl.name].none = "none";
      acc[pl.name].random = "random";
      return acc}, {})
    // data.playlists = game.playlists?.reduce((acc, pl: any) => {acc[pl.name] = pl.name; return acc}, {});
    data.actionTypes = MidiSounds.ActionTypes();

    return data;
  }

  _onSoundControl(event) {
    event.preventDefault();
    const button = event.currentTarget;
    let formData;
    switch (button.dataset.action) {
      case "delete":
        event.target.parentElement.parentElement.parentElement.parentElement.remove(); 
        formData = this._getSubmitData();
        this._updateObject(event, formData).then(() => {this.render(true)})
        break;
      case "add":
        formData = this._getSubmitData();
        for (let key of ["chartype", "action", "category", "playlistName", "soundName", "subtype"]) {
          if (!formData[key]) formData[key] = [];
          if (typeof formData[key] === "string") formData[key] = [formData[key]];
          formData[key].push("none");
        }
        this._updateObject(event, formData).then(() => {this.render(true)})
    }
  }
  async _updateObject(event, formData) {
    if (!game.user?.can("SETTINGS_MODIFY")) return;
    formData = expandObject(formData);
    const settings: any = {};
    if (formData.chartype) {
      if (typeof formData.chartype === "string") {
        for (let key of ["chartype", "action", "category", "playlistName", "soundName", "subtype"]) {
          formData[key] = [formData[key]];
        }
      }
      for (let i = 0; i < formData.chartype?.length ?? 0; i++) {
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
    await game.settings.set("midi-qol", "MidiSoundSettings", settings);
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find(".sound-control").click(this._onSoundControl.bind(this));
    html.find(".soundName").change(function (event) {
      this.submit({ preventClose: true }).then(() => this.render());
    }.bind(this));
    html.find(".playlistName").change(function (event) {
      this.submit({ preventClose: true }).then(() => this.render());
    }.bind(this));
    html.find(".category").change(function (event) {
      this.submit({ preventClose: true }).then(() => this.render());
    }.bind(this));
    html.find(".action").change(function (event) {
      this.submit({ preventClose: true }).then(() => this.render());
    }.bind(this));
    html.find(".subtype").change(function (event) {
      this.submit({ preventClose: true }).then(() => this.render());
    }.bind(this))

    html.find(".import-quick-setting").on("click", function (event) {
      const key = event.currentTarget.id;
      switch(key) {
        case "createPlaylist": MidiSounds.createDefaultPlayList().then(() => this.render(true)); break
        case "basic": MidiSounds.setupBasicSounds().then(() => this.render(true)); break;
        case "detailed": MidiSounds.setupDetailedSounds().then(() => this.render(true)); break;
        case "full": MidiSounds.setupFullSounds().then(() => this.render(true)); break;
      }
    }.bind(this));
  }
}