import { config } from "simple-peer";
import { geti18nOptions, i18n } from "../../midi-qol.js";
import { MidiSounds } from "../midi-sounds.js";
import { autoFastForwardAbilityRolls, configSettings, midiSoundSettings } from "../settings.js";

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
    const dndConfig = CONFIG.DND5E;
    data.weaponSubtypes = mergeObject({any: "Any", none: "None"}, dndConfig.weaponTypes);
    data.equipmentSubtypes = mergeObject({any: "Any"}, dndConfig.equipmentTypes);
    data.consumableSubTypes = mergeObject({any: "Any"}, dndConfig.consumableTypes);
    data.spellSubtypes = mergeObject({any: "Any"}, dndConfig.spellSchools);
    data.toolSubtypes = mergeObject({any: "Any"}, dndConfig.toolTypes);
    data.defaultSubtypes = {any: "Any"};
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
    data.quickSettingsOptions = {creeatePlaylist: "Create Sample Playlist", basic: "Basic Settings", detailed: "Detailed Settings", full: "Full Settings"};
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
        for (let key of ["action", "category", "playlistName", "soundName", "subtype"]) {
          formData[key].push("none");
        }
        this._updateObject(event, formData).then(() => {this.render(true)})
    }
  }
  async _updateObject(event, formData) {
    formData = expandObject(formData);
    const settings = {};
    for (let i = 0; i < formData.category.length ?? 0; i++) {
      const category = formData.category[i];
      const subtype = formData.subtype[i];
      const action = formData.action[i];
      const playlistName = formData.playlistName[i];
      const soundName = formData.soundName[i];
      if (!settings[category]) settings[category] = {};
      if (!settings[category][subtype]) settings[category][subtype] = {};
      settings[category][subtype][action] = {playlistName, soundName};
    }
   
    if (game.user?.can("SETTINGS_MODIFY")) {
      await game.settings.set("midi-qol", "MidiSoundSettings", settings);
    }
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
    html.find(".category").on("click", function (event) {
      this.submit({ preventClose: true }).then(() => this.render());
    }.bind(this));
    html.find(".action").on("click", function (event) {
      this.submit({ preventClose: true }).then(() => this.render());
    }.bind(this));
    html.find(".subtype").on("click", function (event) {
      this.submit({ preventClose: true }).then(() => this.render());
    }.bind(this))

    html.find(".import-quick-setting").on("click", function (event) {
      const key = event.currentTarget.id;
      switch(key) {
        case "creeatePlaylist": MidiSounds.createDefaultPlayList().then(() => this.render(true)); break
        case "basic": MidiSounds.setupBasicSounds().then(() => this.render(true)); break;
        case "detailed": MidiSounds.setupDetailedSounds().then(() => this.render(true)); break;
        case "full": MidiSounds.setupFullSounds().then(() => this.render(true)); break;
      }
    }.bind(this));
  }
}