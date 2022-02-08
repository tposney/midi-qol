import { criticalDamage, itemDeleteCheck, nsaFlag, coloredBorders, autoFastForwardAbilityRolls, importSettingsFromJSON, exportSettingsToJSON, fetchParams, addChatDamageButtons } from "../settings.js"
import { configSettings } from "../settings.js"
import { warn, i18n, error, debug, gameStats, debugEnabled, geti18nOptions, log } from "../../midi-qol.js";
import { installedModules } from "../setupModules.js";
export class ConfigPanel extends FormApplication {

  PATH: string;
  static get defaultOptions(): any {
    return mergeObject(super.defaultOptions, {
      title: game.i18n.localize("midi-qol.ConfigTitle"),
      template: "modules/midi-qol/templates/config.html",
      id: "midi-qol-settings",
      width: 520,
      height: "auto",
      closeOnSubmit: true,
      scrollY: [".tab.workflow"],
      tabs: [{ navSelector: ".tabs", contentSelector: ".content", initial: "gm" }]
    })
  }

  constructor(...args) {
    super(args);
    this.PATH = "./modules/midi-qol/sample-config/";
  }

  get title() {
    return i18n("midi-qol.ConfigTitle")
  }

  async getData(options: any): Promise<any> {
    let wallsBlockRangeOptions = geti18nOptions("WallsBlockRangeOptions");
    if (installedModules.get("dnd5e-helpers")) {
      wallsBlockRangeOptions = geti18nOptions("WallsBlockRangeOptionsNew");
    }

    let quickSettingsOptions = {};
    for (let key of Object.keys(quickSettingsDetails)) {
      quickSettingsOptions[key] = quickSettingsDetails[key].description;
    }
    let data = {
      QuickSettingsBlurb: geti18nOptions("QuickSettingsBlurb"),
      configSettings,
      quickSettings: true,
      quickSettingsOptions,
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
      AutoCEEffectsOptions: geti18nOptions("AutoCEEffectsOptions"),
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
      customSoundsPlaylistOptions: game.playlists.contents.reduce((acc, e) => { acc[e.id] = e.name; return acc }, {}) || {},
      //@ts-ignore .sounds
      customSoundOptions: game.playlists?.get(configSettings.customSoundsPlaylist)?.sounds.reduce((acc, s) => { acc[s.id] = s.name; return acc }, { "none": "" }),
      rollSoundOptions: CONFIG.sounds,
      isBetterRolls: installedModules.get("betterrolls5e"),
    };

    if (debugEnabled > 0) warn("Config Panel: getdata ", data)
    return data;
  }

  activateListeners(html) {
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

    html.find(".import-quick-setting").on("click", async function (event) {
      const key = event.currentTarget.id;
      let settingsToApply = {};
      const config = quickSettingsDetails[key];
      if (config.configSettings) {
        settingsToApply = duplicate(config.configSettings);
        if (config.codeChecks) config.codeChecks(configSettings, settingsToApply)
        showDiffs(configSettings, settingsToApply);
        settingsToApply = mergeObject(configSettings, settingsToApply, { overwrite: true, inplace: true });
      } else if (config.fileName) {
        try {
          const jsonText = await fetchConfigFile(this.PATH + config.fileName);
          const configData = JSON.parse(jsonText);
          settingsToApply = configData.configSettings;
          if (configData.addChatDamageButtons !== undefined)
            game.settings.set("midi-qol", "AddChatDamageButtons", configData.addChatDamageButtons);
          showDiffs(configSettings, settingsToApply);
        } catch (err) {
          error("could not load config file", config.fileName, err);
        }
        log(`Loaded ${config.fileName} verion ${config.version}`);
      } else return;
      if (game.user?.can("SETTINGS_MODIFY")) game.settings.set("midi-qol", "ConfigSettings", settingsToApply);
      this.render();
    }.bind(this))
  }

  async _playList(event) {
    event.preventDefault();
    configSettings.customSoundsPlaylist = `${$(event.currentTarget).children("option:selected").val()}`;
    //@ts-ignore
    await this.submit({ preventClose: true });
    this.render();
  }

  onReset() {
    this.render(true);
  }

  async _updateObject(event, formData) {
    formData = expandObject(formData);
    formData.itemTypeList = configSettings.itemTypeList;
    let newSettings = mergeObject(configSettings, formData, { overwrite: true, inplace: false })
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
  getData(): any {

    // Get current values
    configSettings.itemTypeList;

    // Populate choices
    //@ts-ignore
    const choices: {} = duplicate(CONFIG.Item.typeLabels);
    for (let [k, v] of Object.entries(choices)) {
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
    const chosen: any[] = [];
    for (let [k, v] of Object.entries(formData)) {
      if (v) chosen.push(k);
    }
    configSettings.itemTypeList = chosen;
  }
}
async function importFromJSONDialog() {
  const content = await renderTemplate("templates/apps/import-data.html", { entity: "midi-qol", name: "settings" });
  let dialog = new Promise((resolve, reject) => {
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
            if (!form.data.files.length) return ui.notifications?.error("You did not upload a data file!");
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

async function fetchConfigFile(filename: string | undefined): Promise<string> {
  if (!filename) return "{}";
  return new Promise((resolve, reject) => {
    fetch(filename).then(response => response.text())
      .then(data => {
        resolve(data)
      });
  });
}

function showDiffs(current: any, changed: any, flavor: string = "") {
  const diffs = diffObject(changed, current, { inner: true });
  const changes: string[] = [];
  for (let key of Object.keys(diffs)) {
    let name: string;
    if (key.startsWith("gm"))
      name = key[2].toUpperCase() + key.substring(3);
    else name = key[0].toUpperCase() + key.substring(1);
    let longName = i18n("midi-qol." + name + ".Name");
    if (longName.startsWith("midi-qol")) longName = name;
    debug("Show config changes: Name is ", name, key, key.startsWith("gm") ? "GM" : "", i18n(`midi-qol.${name + ".Name"}`))
    changes.push(`${key.startsWith("gm") ? "GM " : ""}${longName} <strong>${current[key]} => ${changed[key]}</strong>`)
  }
  if (changes.length === 0) changes.push("No Changes");
  let d = new Dialog({
    title: i18n("midi-qol.QuickSettings"),
    content: changes.join("<br>"),
    buttons: {
      close: {
        icon: '<i class="fas fa-check"></i>',
        label: "Close"
      },
    },
    default: "close"
  });
  d.render(true);
  warn("Quick Settings ", changes.join("\n"));
}

let quickSettingsDetails: any = {
  FullAuto: {
    description: "Full Automation: As few button presses as possible",
    fileName: "midi-qol-full-auto.json",
  },
  FullManual: {
    description: "No Automation: All rolls manual",
    fileName: "midi-qol-manual.json"
  },
  GMAuto: {
    description: "GM Attack/Damage: Automatic",
    configSettings: {
      gmAutoAttack: true,
      gmAutoDamage: "onHit",
      gmAutoFastForwardAttack: true,
      gmAutoFastForwardDamage: true,
      gmRemoveButtons: "all",
      gmLateTargeting: false,
      autoItemEffects: true,
      allowUseMacro: true,

    },
  },
  GMManual: {
    description: "GM Attack/Damage: Manual",
    configSettings: {
      gmAutoAttack: false,
      gmAutoDamage: "none",
      gmAutoFastForwardAttack: false,
      gmAutoFastForwardDamage: false,
      gmRemoveButtons: "none",
      gmLateTargeting: false
    },
  },
  PlayerAuto: {
    description: "Player Attack/Dmage Roll: Automatic",
    configSettings: {
      autoRollAttack: true,
      autoRollDamage: "onHit",
      autoFastForward: "all",
      removeButtons: "all",
      lateTargeting: false
    },
  },
  PlayerManual: {
    description: "Player Attack/Dmage Roll: Manual",
    configSettings: {
      autoRollAttack: false,
      autoRollDamage: "none",
      autoFastForward: "none",
      removeButtons: "none",
      lateTargeting: false
    },
  },
  DamageAuto: {
    description: "Automatic Hits/Saves/damage application",
    configSettings: {
      autoCheckHit: "all",
      autoCheckSaves: "all",
      removeButtons: "all",
      playerRollSaves: "chat",
      playerSaveTimeout: 30,
      rollNPCSaves: "auto",
      autoTarget: "wallsBlockIgnoreDefeated",
      rangeTarget: "alwaysIgnoreDefeated",
      rollNPCLinkedSaves: "auto",
      autoCEEffects: "cepri",
      autoItemEffects: true,
      allowUseMacro: true,
      "autoApplyDamage": "yesCard"
    },
    codeChecks: (current, settings) => {
      if (installedModules.get("lmrtfy")) settings.playerRollSaves = "letme";
      else if (installedModules.get("monks-tokenbar")) settings.playerRollSaves = "mtb";
      else {
        ui.notifications?.warn("Player rolls saves works best with `Let Me Roll That For You` or 'Monks Token Bar` installed and active");
      }
    }
  },
  DamageManual: {
    description: "No Hits/Saves/damage application automation",
    configSettings: {
      autoCheckHit: "none",
      autoCheckSaves: "none",
      playerRollSaves: "chat",
      playerSaveTimeout: 30,
      rollNPCSaves: "chat",
      autoTarget: "wallsBlockIgnoreDefeated",
      rangeTarget: "alwaysIgnoreDefeated",
      rollNPCLinkedSaves: "chat",
      autoCEEffects: "cepri",
      autoItemEffects: false,
      allowUseMacro: true,
      autoApplyDamage: "no"
    }
  },
  EnableReactions: {
    description: "Turn on Reaction processing",
    configSettings: {
      "doReactions": "all",
      "gmDoReactions": "all",
      "reactionTimeout": 30,
      "showReactionAttackRoll": "all",
    },
  },
  DisableReactions: {
    description: "Turn off Reaction processing",
    configSettings: {
      doReactions: "none",
      gmDoReactions: "none",
      reactionTimeout: 0,
      showReactionAttackRoll: "all",
    },
  },
  EnableConcentration: {
    description: "Enable Concentration Automation",
    configSettings: {
      removeConcentration: true,
      concentrationAutomation: true,
      singleConcentrationRoll: true,
    },
    codeChecks: (current, settings) => {
      if (installedModules.get("combat-utility-belt") && game.settings.get("combat-utility-belt", "enableConcentrator")) {
        ui.notifications?.warn("`Combat Utility Belt Concentration' is not compatible with midi-qol concentration. CUB concentration has been disabled")
        game.settings.set("combat-utility-belt", "enableConcentrator", false);
      }
    }
  },
  DisableConcentration: {
    description: "Disable Concentration Automation",
    configSettings: {
      removeConcentration: false,
      concentrationAutomation: false,
      singleConcentrationRoll: false,
    },
  },

  SecretSquirrel: {
    description: "Secret Squirrel: Hide most GM roll info from players",
    configSettings: {
      hideRollDetails: "all",
      displaySaveDC: false,
      displaySaveAdvantage: false,
      hideNPCNames: "Unknown Creature",
      showReactionAttackRoll: "none",
      gmHide3dDice: true,
      ghostRolls: true
    },
    codeChecks: (current, settings) => {
      if (current.autoCheckHit !== "none") settings.autoCheckHit = "whisper";
      if (current.autoCheckSaves !== "none") settings.autoCheckSaves = "whisper";
      if (!installedModules.get("combat-utility-belt")) ui.notifications?.warn("'Combat Utility Belt' is recommended to hide creature names for normal dnd5e rolls")
    }
  },
  FullDisclosure: {
    description: "Full Discolsure: Players see the details of all GM rolls and the results",
    configSettings: {
      hideRollDetails: "none",
      displaySaveDC: true,
      displaySaveAdvantage: true,
      showReactionAttackRoll: "all",
      hideNPCNames: "",
      gmHide3dDice: false,
      ghostRolls: false,
    },
    codeChecks: (current, settings) => {
      if (current.autoCheckHit !== "none") settings.autoCheckHit = "all";
      if (current.autoCheckSaves !== "none") settings.autoCheckSaves = "allShow";
    }
  }
}
