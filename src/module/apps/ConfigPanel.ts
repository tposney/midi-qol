import { criticalDamage, nsaFlag, coloredBorders, autoFastForwardAbilityRolls, importSettingsFromJSON, exportSettingsToJSON, enableWorkflow } from "../settings.js"
import { configSettings } from "../settings.js"
import { warn, i18n, error, debug, gameStats, debugEnabled, geti18nOptions, log } from "../../midi-qol.js";
import { installedModules } from "../setupModules.js";

const PATH = "./modules/midi-qol/sample-config/";

export class ConfigPanel extends FormApplication {
  static get defaultOptions(): any {
    return mergeObject(super.defaultOptions, {
      title: game.i18n.localize("midi-qol.ConfigTitle"),
      template: "modules/midi-qol/templates/config.html",
      id: "midi-qol-settings",
      width: 800,
      height: "auto",
      closeOnSubmit: true,
      scrollY: [".tab.workflow"],
      tabs: [{ navSelector: ".tabs", contentSelector: ".content", initial: "gm" }]
    })
  }

  constructor(...args) {
    super(args);
  }

  get title() {
    return i18n("midi-qol.ConfigTitle")
  }

  async getData(options: any): Promise<any> {
    if (!enableWorkflow) {
      ui.notifications?.error("Worklow automation is not enabled")
    }
    let wallsBlockRangeOptions = duplicate(geti18nOptions("WallsBlockRangeOptionsNew"));
    let CoverCalculationOptions = duplicate(geti18nOptions("CoverCalculationOptions"));
    [{id: "levelsautocover", name: "'Levels Auto Cover'"}, {id:"simbuls-cover-calculator", name: "'Simbuls Cover Calculator'"}].forEach(module => {
      if (!installedModules.get(module.id)) {
        wallsBlockRangeOptions[module.id] += ` - ${game.i18n.format("MODMANAGE.DepNotInstalled", { missing: module.name })}`;
        CoverCalculationOptions[module.id] += ` - ${game.i18n.format("MODMANAGE.DepNotInstalled", { missing: module.name })}`;
      }
    });
    if (!installedModules.get("levels")) {
      wallsBlockRangeOptions["centerLevels"] += ` - ${game.i18n.format("MODMANAGE.DepNotInstalled", { missing:"Levels" })}`;

    }

    if (!installedModules.get("levelsautocover"))
      CoverCalculationOptions["levelsautocover"] += " (not installed)";

    if (!installedModules.get("simbuls-cover-calculator"))
      CoverCalculationOptions["simbuls-cover-calculator"] += " (not installed)";
    
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
      playerDamageCardOptions: geti18nOptions("playerDamageCardOptions"),
      damageImmunitiesOptions: geti18nOptions("damageImmunitiesOptions"),
      showItemDetailsOptions: geti18nOptions("showItemDetailsOptions"),
      doReactionsOptions: geti18nOptions("DoReactionsOptions"),
      gmDoReactionsOptions: geti18nOptions("GMDoReactionsOptions"),
      rollOtherDamageOptions: geti18nOptions("RollOtherDamageOptions"),
      showReactionAttackRollOptions: geti18nOptions("ShowReactionAttackRollOptions"),
      wallsBlockRangeOptions,
      CoverCalculationOptions,
      AutoCEEffectsOptions: geti18nOptions("AutoCEEffectsOptions"),
      RecordAOOOptions: geti18nOptions("RecordAOOOptions"),
      EnforceReactionsOptions: geti18nOptions("EnforceReactionsOptions"),
      AutoEffectsOptions: geti18nOptions("AutoEffectsOptions"),
      RequireMagicalOptions: geti18nOptions("RequireMagicalOptions"),
      //@ts-ignore
      itemTypeLabels: CONFIG.Item.typeLabels,
      hasConvenientEffects: installedModules.get("dfreds-convenient-effects"),
      hideRollDetailsOptions: geti18nOptions("hideRollDetailsOptions"),
      checkFlankingOptions: geti18nOptions("CheckFlankingOptions"),
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
      rollAlternateOptions: geti18nOptions("RollAlternateOptions"),
      ConsumeResourceOptions: geti18nOptions("ConsumeResourceOptions"),
      AddDeadOptions: geti18nOptions("AddDeadOptions"),
      LateTargetingOptions: geti18nOptions("LateTargetingOptions"),
      RemoveConcentrationEffectsOptions: geti18nOptions("RemoveConcentrationEffectsOptions")
    };

    if (debugEnabled > 0) warn("Config Panel: getData ", data)
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
      new ItemTypeSelector({}, {}).render(true)
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
      await applySettings.bind(this)(key);
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

export class ItemTypeSelector extends FormApplication {

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
    if (!enableWorkflow) {
      ui.notifications?.error("Worklow automation is not enabled")
    }
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

function showDiffs(current: any, changed: any, flavor: string = "", title: string = "") {
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
    let currentVal = current[key];
    let changedVal = changed[key];
    if (typeof currentVal === "object") currentVal = "Object"
    if (typeof changedVal === "object") changedVal = "Object"

    changes.push(`${key.startsWith("gm") ? "GM " : ""}${longName} <strong>${currentVal} => ${changedVal}</strong>`)
  }
  if (changes.length === 0) changes.push("No Changes");
  const dialog = new Promise((resolve, reject) => {
    let dialogTitle;
    if (title !== "") dialogTitle = `${i18n("midi-qol.QuickSettings")} - ${title}`;
    else dialogTitle = i18n("midi-qol.QuickSettings");
    let d = new Dialog({
      title: dialogTitle,
      content: changes.join("<br>"),
      buttons: {
        apply: {
          icon: '<i class="fas fa-check"></i>',
          label: "Apply Changes",
          callback: () => resolve(true)
        },
        abort: {
          icon: '<i class="fas fa-xmark"></i>',
          label: "Don't Apply Changes",
          callback: () => resolve(false)
        }
      },
      default: "apply",
      close: () => resolve(false)
    });
    d.render(true);
    warn("Quick Settings ", changes.join("\n"));
  })
  return dialog;
}

let quickSettingsDetails: any = {
  FullAuto: {
    description: "Full Automation: As few button presses as possible",
    shortDescription: "Full Automation",
    fileName: "midi-qol-full-auto.json",
  },
  FullManual: {
    description: "No Automation: All rolls manual",
    shortDescription: "No Automation",
    fileName: "midi-qol-manual.json"
  },
  GMAuto: {
    description: "GM Attack/Damage: Automatic",
    shortDescription: "GM Attack/Damage: Automatic",
    configSettings: {
      gmAutoAttack: true,
      gmAutoDamage: "onHit",
      gmAutoFastForwardAttack: true,
      gmAutoFastForwardDamage: true,
      gmRemoveButtons: "all",
      gmLateTargeting: "none",
      autoItemEffects: "applyRemove",
      allowUseMacro: true,
    },
  },
  GMManual: {
    description: "GM Attack/Damage: Manual",
    shortDescription: "GM Attack/Damage: Manual",
    configSettings: {
      gmAutoAttack: false,
      gmAutoDamage: "none",
      gmAutoFastForwardAttack: false,
      gmAutoFastForwardDamage: false,
      gmRemoveButtons: "none",
      gmLateTargeting: "none"
    },
  },
  PlayerAuto: {
    description: "Player Attack/Damage Roll: Automatic",
    shortDescription: "Player Attack/Damage Roll: Automatic",
    configSettings: {
      autoRollAttack: true,
      autoRollDamage: "onHit",
      autoFastForward: "all",
      removeButtons: "all",
      lateTargeting: "none"
    },
  },
  PlayerManual: {
    description: "Player Attack/Damage Roll: Manual",
    shortDescription: "Player Attack/Damage Roll: Manual",
    configSettings: {
      autoRollAttack: false,
      autoRollDamage: "none",
      autoFastForward: "none",
      removeButtons: "none",
      lateTargeting: "none"
    },
  },
  DamageAuto: {
    description: "Automatic Hits/Saves/damage application",
    shortDescription: "Auto. Hits/Saves/dmg. application",
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
      autoItemEffects: "applyRemove",
      allowUseMacro: true,
      autoApplyDamage: "yesCard"
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
    shortDescription: "No Hits/Saves/dmg. app. automation",
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
      autoItemEffects: "off",
      allowUseMacro: true,
      autoApplyDamage: "no"
    }
  },
  EnableReactions: {
    description: "Turn on Reaction processing",
    shortDescription: "Turn on Reaction processing",
    configSettings: {
      "doReactions": "all",
      "gmDoReactions": "all",
      "reactionTimeout": 30,
      "showReactionAttackRoll": "all",
      enforceReactions: "all",
      recordAOO: "all"
    },
    codeChecks: (current, settings) => {
      let changesMade = false;
      if (current.autoCheckHit === "none") {
        settings.autoCheckHit = "whisper";
        changesMade = true;
      }
      if (current.autoCheckSaves === "none") {
        settings.autoCheckSaves = "whisper";
        changesMade = true;
      }
      if (current.playerRollSaves === "none") {
        settings.playerRollSaves = "chat";
        changesMade = true;
      }
      if (current.rollNPCLinkedSaves === "none") {
        settings.rollNPCLinkedSaves = "chat";
        changesMade = true;
      }
      if (current.autoApplyDamage === "none") {
        settings.autoApplyDamage = "noCard";
        changesMade = true;
      }
      if (changesMade) ui.notifications?.warn("midi-qol Some automation enabled to support reaction processing")
    }
  },
  DisableReactions: {
    description: "Turn off Reaction processing",
    shortDescription: "Turn off Reaction processing",
    configSettings: {
      doReactions: "none",
      gmDoReactions: "none",
      reactionTimeout: 0,
      showReactionAttackRoll: "all",
      enforceReactions: "none",
      recordAOO: "none"
    },
  },
  EnableConcentration: {
    description: "Enable Concentration Automation",
    shortDescription: "Enable Concentration Automation",
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
  NoDamageApplication: {
    description: "Allow GM to fudge damage application (display but no auto apply)",
    shortDescription: "Allow GM to fudge damage application",
    configSettings: {
      autoApplyDamage: "noCard"
    },
    codeChecks: (current, settings) => {
      game.settings.set("midi-qol", "AddChatDamageButtons", "gm");
    }
  },
  DisableConcentration: {
    description: "Disable Concentration Automation",
    shortDescription: "Disable Concentration Automation",
    configSettings: {
      removeConcentration: false,
      concentrationAutomation: false,
      singleConcentrationRoll: false,
    },
  },

  SecretSquirrel: {
    description: "Secret Squirrel: Hide most GM roll info from players",
    shortDescription: "Secret Squirrel",
    configSettings: {
      hideRollDetails: "all",
      displaySaveDC: false,
      displaySaveAdvantage: false,
      hideNPCNames: "Unknown Creature",
      showReactionAttackRoll: "none",
      gmHide3dDice: true,
      ghostRolls: true,
      displayHitResultNumeric: false
    },
    codeChecks: (current, settings) => {
      if (current.autoCheckHit !== "none") settings.autoCheckHit = "whisper";
      if (current.autoCheckSaves !== "none") settings.autoCheckSaves = "whisper";
      if (!installedModules.get("combat-utility-belt")) ui.notifications?.warn("'Combat Utility Belt' is recommended to hide creature names for normal dnd5e rolls")
    }
  },
  FullDisclosure: {
    description: "Full Disclosure: Players see the details of all GM rolls and the results",
    shortDescription: "Full Disclosure",
    configSettings: {
      hideRollDetails: "none",
      displaySaveDC: true,
      displaySaveAdvantage: true,
      showReactionAttackRoll: "all",
      hideNPCNames: "",
      gmHide3dDice: false,
      ghostRolls: false,
      displayHitResultNumeric: true
    },
    codeChecks: (current, settings) => {
      if (current.autoCheckHit !== "none") settings.autoCheckHit = "all";
      if (current.autoCheckSaves !== "none") settings.autoCheckSaves = "allShow";
    }
  }
}

export async function applySettings(key: string) {
  let settingsToApply = {};
  const config = quickSettingsDetails[key];
  if (config.configSettings) {
    settingsToApply = duplicate(config.configSettings);
    if (config.codeChecks) config.codeChecks(configSettings, settingsToApply)
    if (await showDiffs(configSettings, settingsToApply, "", config.shortDescription)) {
      settingsToApply = mergeObject(configSettings, settingsToApply, { overwrite: true, inplace: true });
      if (game.user?.can("SETTINGS_MODIFY")) game.settings.set("midi-qol", "ConfigSettings", settingsToApply);
    }
  } else if (config.fileName) {
    try {
      const jsonText = await fetchConfigFile(PATH + config.fileName);
      const configData = JSON.parse(jsonText);
      if (await showDiffs(configSettings, configData.configSettings, "", config.shortDescription)) {
        importSettingsFromJSON(jsonText);
      }
      return;
    } catch (err) {
      error("could not load config file", config.fileName, err);
    }
    log(`Loaded ${config.fileName} version ${config.version}`);
  } else return;
}