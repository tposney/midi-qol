import { criticalDamage, macroSpeedRolls, itemDeleteCheck, nsaFlag, coloredBorders, addChatDamageButtons,  checkBetterRolls } from "../settings"
 import { configSettings } from "../settings"
import { warn, i18n } from "../../midi-qol";
export class ConfigPanel extends FormApplication {
  
  static get defaultOptions() {
    return mergeObject(super.defaultOptions, {
      title: game.i18n.localize("midi-qol.ConfigTitle"),
      id: "midi-qol-config",
      template: "modules/midi-qol/templates/config.html",
      width: 520,
      height: 845,
      closeOnSubmit: true
    })
  }

  get title() {
    return i18n("midi-qol.ConfigTitle")
  }

  getData(options) {
    return {
      configSettings,
      speedItemRollsOptions: {off: "Off", on: "On", onCard: "On + Show Item Card"},
      autoCheckHitOptions: {none: "None", all: "Check - all see result", whisper: "Check - only GM sees"},
      clickOptions: {off: "Off", attack: "Attack Rolls Only", damage: "Damage Rolls Only", all: "Attack and Damage"},
      autoTargetOptions: {none: "None", always: "Always", wallsBlock: "Walls Block"},
      autoCheckSavesOptions: {none: "Off", all:  "Save - All see result", whisper: "Save - only GM sees", allShow: "Save - All see Result + Rolls"},
      autoRollDamageOptions: {none: "Never", always:  "Always", onHit: "Attack Hits"},
      criticalDamage,
      addChatDamageButtons,
      autoApplyDamageOptions: {none: "No", yes: "Yes", yesCard: "Yes + undo damage card"},
      damageImmunitiesOptions: {none: "Never", immunityDefult: "apply immuniites", immunityPhysical: "apply immunities + physical"},
      macroSpeedRolls,
      itemDeleteCheck,
      nsaFlag,
      coloredBorders,
      checkBetterRolls,
      playerRollSavesOptions: {none: "None",  letme: "Let Me Roll That For You", letmeQuery: "LMRTFY + Querey", chat: "Chat Message"},
      rollSoundOptions: CONFIG.sounds
    }
  }

  onReset() {
      this.render(true);
  }

  async _updateObject(event, formData) {
    const newSettings = mergeObject(configSettings, formData, {overwrite: true})
    if (game.user.isGM) game.settings.set("midi-qol", "ConfigSettings", newSettings)
  }
}