import { criticalDamage, itemDeleteCheck, nsaFlag, coloredBorders, autoFastForwardAbilityRolls, importSettingsFromJSON, exportSettingsToJSON } from "../settings.js"
 import { configSettings } from "../settings.js"
import { warn, i18n, error, debug, gameStats, debugEnabled, geti18nOptions } from "../../midi-qol.js";
import { installedModules } from "../setupModules.js";
export class ConfigPanel extends FormApplication {
  
  static get defaultOptions(): any {
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
  async getData(options: any) : Promise<any> {
    let wallsBlockRangeOptions = geti18nOptions("WallsBlockRangeOptions");
    if (installedModules.get("dnd5e-helpers")) {
      wallsBlockRangeOptions = geti18nOptions("WallsBlockRangeOptionsNew");
    }

    let data = {
      configSettings,
      speedItemRollsOptions: geti18nOptions("speedItemRollsOptions"),
      autoCheckHitOptions: geti18nOptions("autoCheckHitOptions"),
      clickOptions: geti18nOptions("clickOptions"),
      autoTargetOptions: geti18nOptions("autoTargetOptions"),
      rangeTargetOptions: geti18nOptions("rangeTargetOptions"),
      requiresTargetsOptions: geti18nOptions("requiresTargetsOptions"),
      autoCheckSavesOptions: geti18nOptions("autoCheckSavesOptions"),
      autoRollDamageOptions: geti18nOptions("autoRollDamageOptions"),
      removeButtonsOptions: geti18nOptions("removeButtonsOptions"),
      criticalDamage,
      autoApplyDamageOptions: geti18nOptions("autoApplyDamageOptions"),
      damageImmunitiesOptions: geti18nOptions("damageImmunitiesOptions"),
      showItemDetailsOptions: geti18nOptions("showItemDetailsOptions"),
      doReactionsOptions: geti18nOptions("DoReactionsOptions"),
      gmDoReactionsOptions: geti18nOptions("GMDoReactionsOptions"),
      rollOtherDamageOptions: geti18nOptions("RollOtherDamageOptions"),
      showReactionAttackRollOptions: geti18nOptions("ShowReactionAttackRollOptions"),
      wallsBlockRangeOptions,
      //@ts-ignore
      itemTypeLabels: CONFIG.Item.typeLabels,
      hasConvenientEffects: installedModules.get("dfreds-convenient-effects"),
      itemDeleteCheck,
      hideRollDetailsOptions: geti18nOptions("hideRollDetailsOptions"),
      hideRollDetailsHint: i18n("midi-qol.HideRollDetails.HintLong"),
      nsaFlag,
      coloredBorders,
      playerRollSavesOptions: (autoFastForwardAbilityRolls && false) ? geti18nOptions("playerRollSavesOptionsReduced") : geti18nOptions("playerRollSavesOptions"),
      rollNPCSavesOptions: geti18nOptions("rollNPCSavesOptions"),
      //@ts-ignore .map undefined
      customSoundsPlaylistOptions: game.playlists.contents.reduce((acc, e) =>{acc[e.id]= e.name; return acc}, {}) || {},
      //@ts-ignore .sounds
      customSoundOptions: game.playlists?.get(configSettings.customSoundsPlaylist)?.sounds.reduce((acc, s) =>{acc[s.id]= s.name; return acc}, {"none": ""}),
      rollSoundOptions: CONFIG.sounds,
      isBetterRolls: installedModules.get("betterrolls5e"),
      keys: {
        "altKey": "alt",
        "ctrlKey": "ctrl|cmd",
        "shiftKey": "shift"
      }
    };

    if (debugEnabled > 0) warn("Config Panel: getdata ", data)
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

    html.find("#midi-qol-export-config").on("click", exportSettingsToJSON)
    html.find("#midi-qol-import-config").on("click", async () => {
      if (await importFromJSONDialog()) {
        this.close();
      }
    });

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
    if (game.user?.can("SETTINGS_MODIFY")) game.settings.set("midi-qol", "ConfigSettings", newSettings);
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
    //@ts-ignore .name
	  return this.options.name;
  }

  /* -------------------------------------------- */

  /** @override */
  getData() : any {

    // Get current values
    configSettings.itemTypeList;

    // Populate choices
    //@ts-ignore
    const choices: {} = duplicate(CONFIG.Item.typeLabels);
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
    const chosen : any[] = [];
    for ( let [k, v] of Object.entries(formData) ) {
      if ( v ) chosen.push(k);
    }
    configSettings.itemTypeList = chosen;
  }
}
async function importFromJSONDialog() {
  const content = await renderTemplate("templates/apps/import-data.html", {entity: "midi-qol", name: "settings"});
  let dialog =  new Promise((resolve, reject) => {
    new Dialog({
      title: `Import midi-qol settings`,
      content: content,
      buttons: {
        import: {
          icon: '<i class="fas fa-file-import"></i>',
          label: "Import",
          callback: html => {
            //@ts-ignore
            const form = html.find("form")[0];
            if ( !form.data.files.length ) return ui.notifications?.error("You did not upload a data file!");
            readTextFromFile(form.data.files[0]).then(json => {
              importSettingsFromJSON(json)
              resolve(true);
            });
          }
        },
        no: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel",
          callback: html => resolve(false)
        }
      },
      default: "import"
    }, {
      width: 400
    }).render(true);
  });
  return await dialog;
}