import { criticalDamage, itemDeleteCheck, nsaFlag, coloredBorders, addChatDamageButtons,  checkBetterRolls } from "../settings"
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
      autoApplyDamageOptions: {none: "No", noCard: "No + damage card", yes: "Yes", yesCard: "Yes + damage card", },
      damageImmunitiesOptions: {none: "Never", immunityDefult: "apply immuniites", immunityPhysical: "apply immunities + physical"},
      showItemDetailsOptions: {none: "None", cardOnly: "Card Only", pc: "Card + Details: PC Only", all: "Card + Details: NPC + PC"},
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
  activateListeners(html) {
    super.activateListeners(html);
    html.find("#useMaestroSounds").click((ev) => {warn("click handler fired"); configSettings.useMaestroSounds = !configSettings.useMaestroSounds; this.render(false)});
  }
  async _updateObject(event, formData) {
    warn("Form data is ", formData)
    const newSettings = mergeObject(configSettings, formData, {overwrite: true})
    if (game.user.isGM) game.settings.set("midi-qol", "ConfigSettings", newSettings);
  }
}
/*
      <div class="form-group fumbleSound">
        <label>{{localize "midi-qol.FumbleSound.Name"}}</label>
        <select name="fumbleSound" data-dtype="String">
          {{#select configSettings.fumbleSound}}
          {{#each rollSoundOptions as |val label|}}
          <option value="{{val}}">{{label}}</option>
          {{/each}}
          {{/select}}
        </select>
      </div>

      <div class="form-group criticalSound">
        <label>{{localize "midi-qol.CriticalSound.Name"}}</label>
        <select name="criticalSound" data-dtype="String">
          {{#select configSettings.criticalSound}}
          {{#each rollSoundOptions as |val label|}}
          <option value="{{val}}">{{label}}</option>
          {{/each}}
          {{/select}}
        </select>
      </div>
      <div class="form-group">
        <button data-target="diceSound" data-type="audi">
          <i class="fas fa-save"></i> {{midi-qol.DiceSounds.Name}}
        </button>
        <input type="String" name="diceSound" value="{{configSettings.diceSound}}" data-dtype="String" />
      </div>
      <div class="midi-qol-faint">{{localize "midi-qol.PlayerSaveTimeout.Hint"}}</div>
          <div>{{localize "midi-qol.DiceSounds.Hint"}}</div>
          <div class="form-group diceSound">
            <label>{{localize "midi-qol.DiceSound.Name"}}</label>
            <select name="diceSound" data-dtype="String">
              {{#select configSettings.diceSound}}
              {{#each rollSoundOptions as |val label|}}
              <option value="{{val}}">{{label}}</option>
              {{/each}}
              {{/select}}
            </select>
          </div>
      <div class="midi-qol-box">
        <div class="form-group SpeedItemRolls">
          <label>{{localize "midi-qol.SpeedItemRolls.Name"}}</label>
          <select name="speedItemRolls" data-dtype="String">
            {{#select configSettings.speedItemRolls}}
            {{#each speedItemRollsOptions as |label val|}}
            <option value="{{val}}">{{label}}</option>
            {{/each}}
            {{/select}}
          </select>
          {{localize "midi-qol.SpeedItemRolls.Hint"}}
        </div>
static fromButton(button, options) {
  if ( !(button instanceof HTMLElement ) ) throw "You must pass an HTML button";
  let type = button.getAttribute("data-type");

  // Identify the target form field
  let form = button.form,
      target = form[button.getAttribute("data-target")];
  if ( !target ) return;

  // Build and return a FilePicker instance
  return new FilePicker({field: target, type: type, current: target.value, button: button});
  */
