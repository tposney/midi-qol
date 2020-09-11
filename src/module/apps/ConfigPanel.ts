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
      rollSoundOptions: CONFIG.sounds
    };
    warn("Returning data ", data)
    return data;
  }

  onReset() {
      this.render(true);
  }
  
  async _updateObject(event, formData) {
    debug("Form data is ", formData)
    const newSettings = mergeObject(configSettings, formData, {overwrite: true})
    console.warn("data is ", formData, configSettings)
    if (game.user.isGM) game.settings.set("midi-qol", "ConfigSettings", newSettings);
  }
  
}
