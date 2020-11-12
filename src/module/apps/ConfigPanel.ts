import { criticalDamage, itemDeleteCheck, nsaFlag, coloredBorders, addChatDamageButtons,  checkBetterRolls } from "../settings"
 import { configSettings } from "../settings"
import { warn, i18n, error, debug } from "../../midi-qol";
export class ConfigPanel extends FormApplication {
  
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      title: game.i18n.localize("midi-qol.ConfigTitle"),
      template: "modules/midi-qol/templates/config.html",
      width: 520,
      height: 845,
      closeOnSubmit: true,
    })
  }

  get title() {
    return i18n("midi-qol.ConfigTitle")
  }

  getData() {
    let data = {
      configSettings,
      speedItemRollsOptions: i18n("midi-qol.speedItemRollsOptions"),
      autoCheckHitOptions: i18n("midi-qol.autoCheckHitOptions"),
      clickOptions: i18n("midi-qol.clickOptions"),
      autoTargetOptions: i18n("midi-qol.autoTargetOptions"),
      autoCheckSavesOptions: i18n("midi-qol.autoCheckSavesOptions"),
      autoRollDamageOptions: i18n("midi-qol.autoRollDamageOptions"),
      criticalDamage,
      autoApplyDamageOptions: i18n("midi-qol.autoApplyDamageOptions"),
      damageImmunitiesOptions: i18n("midi-qol.damageImmunitiesOptions"),
      showItemDetailsOptions: i18n("midi-qol.showItemDetailsOptions"),
      itemDeleteCheck,
      hideRollDetailsOptions: i18n("midi-qol.hideRollDetailsOptions"),
      nsaFlag,
      coloredBorders,
      checkBetterRolls,
      playerRollSavesOptions: i18n("midi-qol.playerRollSavesOptions"),
      //@ts-ignore .map undefined
      customSoundsPlaylistOptions: game.playlists.entries.reduce((acc, e) =>{acc[e._id]= e.name; return acc}, {}),
      customSoundOptions: game.playlists.get(configSettings.customSoundsPlaylist)?.sounds.reduce((acc, s) =>{acc[s._id]= s.name; return acc}, {"none": ""}),
      rollSoundOptions: CONFIG.sounds,
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
    /* special handling for:
    keyMapping.DND5E.Advantage: "altKey"
    keyMapping.DND5E.Critical: "altKey"
    keyMapping.DND5E.Disadvantage: "ctrlKey"
    keyMapping.DND5E.Versatile: "shiftKey"
    */
   const keyMapping = {
     "DND5E.Advantage": formData["keyMapping.DND5E.Advantage"] || "altKey",
     "DND5E.Critical": formData["keyMapping.DND5E.Critical"],
     "DND5E.Disadvantage": formData["keyMapping.DND5E.Disadvantage"],
     "DND5E.Versatile": formData["keyMapping.DND5E.Versatile"],
   }
    formData = expandObject(formData);
    delete formData.keyMapping;
    formData.keyMapping = keyMapping;

    let newSettings = mergeObject(configSettings, formData, {overwrite:true, inplace:false})
    // const newSettings = mergeObject(configSettings, expand, {overwrite: true})
    if (game.user.can("SETTINGS_MODIFY")) game.settings.set("midi-qol", "ConfigSettings", newSettings);
  }
}
