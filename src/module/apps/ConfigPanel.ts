import { itemRollButtons, speedItemRolls, autoShiftClick, autoTarget, autoCheckHit, autoCheckSaves, checkSaveText, autoRollDamage, criticalDamage,
 addChatDamageButtons, autoApplyDamage, damageImmunities, macroSpeedRolls, hideNPCNames, useTokenNames, itemDeleteCheck, nsaFlag, autoItemEffects,
 coloredBorders, rangeTarget, autoRemoveTargets, checkBetterRolls, playerRollSaves, playerSaveTimeout, preRollChecks, mergeCard } from "../settings"
import { warn } from "../../midi-qol";
export class ConfigPanel extends FormApplication {
  
  static get defaultOptions() {
    warn("Config panel default options");

    return mergeObject(super.defaultOptions, {
      title: game.i18n.localize("DICESONICE.configTitle"),
      id: "midi-qol-config",
      template: "modules/midi-qol/templates/config.html",
      width: 500,
      height: 845,
      closeOnSubmit: true
    })
  }

  getData(options) {
    warn("config panel get data")
    return {
      itemRollButtons,
      speedItemRolls,
      speeItemRollsEnabled: speedItemRolls !== "none",
      autoShiftClick,
      autoTarget,
      autoCheckHit,
      autoCheckSaves,
      checkSaveText,
      autoRollDamage,
      criticalDamage,
      addChatDamageButtons,
      autoApplyDamage,
      damageImmunities,
      macroSpeedRolls,
      hideNPCNames,
      useTokenNames,
      itemDeleteCheck,
      nsaFlag,
      autoItemEffects,
      coloredBorders,
      rangeTarget,
      autoRemoveTargets,
      checkBetterRolls,
      playerRollSaves,
      playerSaveTimeout,
      preRollChecks,
      mergeCard
    }

  }

  activateListeners(html) {
      super.activateListeners(html);

  

      html.find('input[name="hideAfterRoll"]').change(this.toggleHideAfterRoll.bind(this));
      html.find('input[name="autoscale"]').change(this.toggleAutoScale.bind(this));
      html.find('select[name="colorset"]').change(this.toggleCustomColors.bind(this));
      html.find('input,select').change(this.onApply.bind(this));
      html.find('button[name="reset"]').click(this.onReset.bind(this));

  }

  toggleHideAfterRoll() {
    //@ts-ignore
      let hideAfterRoll = $('input[name="hideAfterRoll"]')[0].checked;
      $('input[name="timeBeforeHide"]').prop("disabled", !hideAfterRoll);
      $('select[name="hideFX"]').prop("disabled", !hideAfterRoll);
  }

  toggleAutoScale() {
    //@ts-ignore
      let autoscale = $('input[name="autoscale"]')[0].checked;
      $('input[name="scale"]').prop("disabled", autoscale);
      $('.range-value').css({ 'opacity' : autoscale ? 0.4 : 1});
  }

  toggleCustomColors() {
      let colorset = $('select[name="colorset"]').val() !== 'custom';
      $('input[name="labelColor"]').prop("disabled", colorset);
      $('input[name="diceColor"]').prop("disabled", colorset);
      $('input[name="outlineColor"]').prop("disabled", colorset);
      $('input[name="edgeColor"]').prop("disabled", colorset);
      $('input[name="labelColorSelector"]').prop("disabled", colorset);
      $('input[name="diceColorSelector"]').prop("disabled", colorset);
      $('input[name="outlineColorSelector"]').prop("disabled", colorset);
      $('input[name="edgeColorSelector"]').prop("disabled", colorset);
  }

  onApply(event) {
      event.preventDefault();

      setTimeout(() => {

          let config = {
              labelColor: $('input[name="labelColor"]').val(),
              diceColor: $('input[name="diceColor"]').val(),
              outlineColor: $('input[name="outlineColor"]').val(),
              edgeColor: $('input[name="edgeColor"]').val(),
              autoscale: false,
              scale: 60,
              shadowQuality:$('select[name="shadowQuality"]').val(),
              bumpMapping: $('input[name="bumpMapping"]').is(':checked'),
              colorset: $('select[name="colorset"]').val(),
              texture: $('select[name="texture"]').val(),
              sounds: $('input[name="sounds"]').is(':checked'),
              system: $('select[name="system"]').val()
          };

      }, 100);
  }

  onReset() {
      this.render();
  }

  async _updateObject(event, formData) {
      let settings = mergeObject(CONFIG, formData, { insertKeys: false, insertValues: false });
      let appearance = mergeObject({}, formData, { insertKeys: false, insertValues: false });
      await game.settings.set('dice-so-nice', 'settings', settings);
      await game.user.setFlag("dice-so-nice", "appearance", appearance);
      ui.notifications.info(game.i18n.localize("DICESONICE.saveMessage"));
  }
}