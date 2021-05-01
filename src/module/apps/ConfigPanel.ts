import { criticalDamage, itemDeleteCheck, nsaFlag, coloredBorders, autoFastForwardAbilityRolls } from "../settings"
 import { configSettings } from "../settings"
import { warn, i18n, error, debug, gameStats } from "../../midi-qol";
import { RollStats } from "../RollStats";
import { installedModules } from "../setupModules";
export class ConfigPanel extends FormApplication {
  
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      title: game.i18n.localize("midi-qol.ConfigTitle"),
      template: "modules/midi-qol/templates/config.html",
      id: "midi-qol-settings",
      width: 520,
      height: "auto",
      closeOnSubmit: true,
      scrollY:[".tab.workflow"],
      tabs: [{navSelector: ".tabs", contentSelector: ".content", initial: "gm"}]
    })
  }

  get title() {
    return i18n("midi-qol.ConfigTitle")
  }
  getData() {
//@ts-ignore
    let data = {
      configSettings,
      speedItemRollsOptions: i18n("midi-qol.speedItemRollsOptions"),
      autoCheckHitOptions: i18n("midi-qol.autoCheckHitOptions"),
      clickOptions: i18n("midi-qol.clickOptions"),
      autoTargetOptions: i18n("midi-qol.autoTargetOptions"),
      autoCheckSavesOptions: i18n("midi-qol.autoCheckSavesOptions"),
      autoRollDamageOptions: i18n("midi-qol.autoRollDamageOptions"),
      removeButtonsOptions: i18n("midi-qol.removeButtonsOptions"),
      criticalDamage,
      autoApplyDamageOptions: i18n("midi-qol.autoApplyDamageOptions"),
      damageImmunitiesOptions: i18n("midi-qol.damageImmunitiesOptions"),
      showItemDetailsOptions: i18n("midi-qol.showItemDetailsOptions"),
      //@ts-ignore
      itemTypeLabels: CONFIG.Item.typeLabels,
      itemDeleteCheck,
      hideRollDetailsOptions: i18n("midi-qol.hideRollDetailsOptions"),
      nsaFlag,
      coloredBorders,
      playerRollSavesOptions: (autoFastForwardAbilityRolls && false) ? i18n("midi-qol.playerRollSavesOptionsReduced") : i18n("midi-qol.playerRollSavesOptions") ,
      rollNPCSavesOptions: i18n("midi-qol.rollNPCSavesOptions"),
      //@ts-ignore .map undefined
      customSoundsPlaylistOptions: game.playlists.entities.reduce((acc, e) =>{acc[e._id]= e.name; return acc}, {}),
      customSoundOptions: game.playlists.get(configSettings.customSoundsPlaylist)?.sounds.reduce((acc, s) =>{acc[s._id]= s.name; return acc}, {"none": ""}),
      rollSoundOptions: CONFIG.sounds,
      isBetterRolls: installedModules.get("betterrolls5e"),
      keys: {
        "altKey": "alt",
        "ctrlKey": "ctrl|cmd",
        "shiftKey": "shift"
      }
    };
    warn("Config Panel: getdata ", data)
    return data;

  }

  activateListeners(html) {
    html.find(".speedRolls").change(() => {
      configSettings.speedItemRolls = !configSettings.speedItemRolls;
      this.render()
    });
    html.find(".customSounds").change(() => {
      configSettings.useCustomSounds = !configSettings.useCustomSounds;
      this.render()
    });

    html.find(".playlist").change(this._playList.bind(this));
    super.activateListeners(html)

    html.find(".itemTypeListEdit").on("click", event => {
      new IemTypeSelector({}, {}).render(true)
    })
    html.find(".optionalRulesEnabled").on("click", event => {
      configSettings.optionalRulesEnabled = !configSettings.optionalRulesEnabled;
      this.render();
    })

    html.find("#midi-qol-show-stats").on("click", event => {
      gameStats.showStats();
    })
  }

  async _playList(event) {
      event.preventDefault();
      configSettings.customSoundsPlaylist = `${$(event.currentTarget).children("option:selected").val()}`;
      //@ts-ignore
      return this.submit({preventClose: true}).then(() => this.render());
  }

  onReset() {
      this.render(true);
  }
  
  async _updateObject(event, formData) {

   const keyMapping = {
     "DND5E.Advantage": formData["keyMapping.DND5E.Advantage"] || "altKey",
     "DND5E.Critical": formData["keyMapping.DND5E.Critical"],
     "DND5E.Disadvantage": formData["keyMapping.DND5E.Disadvantage"],
     "DND5E.Versatile": formData["keyMapping.DND5E.Versatile"],
   }
    formData = expandObject(formData);
    formData.itemTypeList = configSettings.itemTypeList;
    delete formData.keyMapping;
    formData.keyMapping = keyMapping;
    let newSettings = mergeObject(configSettings, formData, {overwrite:true, inplace:false})
    // const newSettings = mergeObject(configSettings, expand, {overwrite: true})
    if (game.user.can("SETTINGS_MODIFY")) game.settings.set("midi-qol", "ConfigSettings", newSettings);
  }
}

export class IemTypeSelector extends FormApplication {

  /** @override */
	static get defaultOptions() {
	  return mergeObject(super.defaultOptions, {
	    id: "midi-qol-item-selector",
      classes: ["dnd5e"],
      title: "Show Item Details",
      template: "modules/midi-qol/templates/itemTypeSelector.html",
      width: 320,
      height: "auto",
      choices: {},
      allowCustom: false,
      minimum: 0,
      maximum: null
    });
  }

  /* -------------------------------------------- */

  /**
   * Return a reference to the target attribute
   * @type {String}
   */
  get attribute() {
	  return this.options.name;
  }

  /* -------------------------------------------- */

  /** @override */
  getData() {

    // Get current values
    configSettings.itemTypeList;

    // Populate choices
    //@ts-ignore
    const choices = duplicate(CONFIG.Item.typeLabels);
    for ( let [k, v] of Object.entries(choices) ) {
      choices[k] = {
        label: i18n(v),
        chosen: configSettings.itemTypeList?.includes(k)
      }
    }

    // Return data
	  return {
      allowCustom: false,
	    choices: choices,
      custom: ""
    }
  }

  /* -------------------------------------------- */

  /** @override */
  //@ts-ignore
  _updateObject(event, formData) {
    const updateData = {};

    // Obtain choices
    const chosen = [];
    for ( let [k, v] of Object.entries(formData) ) {
      if ( v ) chosen.push(k);
    }
    configSettings.itemTypeList = chosen;
  }
}
