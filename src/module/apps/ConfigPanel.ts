import { criticalDamage, nsaFlag, coloredBorders, autoFastForwardAbilityRolls, importSettingsFromJSON, exportSettingsToJSON, enableWorkflow } from "../settings.js"
import { configSettings } from "../settings.js"
import { warn, i18n, error, debug, gameStats, debugEnabled, geti18nOptions, log, GameSystemConfig } from "../../midi-qol.js";
import { installedModules } from "../setupModules.js";
import { get } from "jquery";
const { DialogV2 } = foundry.applications.api;

const PATH = "./modules/midi-qol/sample-config/";

export class ConfigPanel extends FormApplication {
  configHookId: number | undefined;
  static get defaultOptions(): any {
    return foundry.utils.mergeObject(super.defaultOptions, {
      title: i18n("midi-qol.ConfigTitle"),
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
    this.configHookId = Hooks.on("midi-qol.ConfigSettingsChanged", () => {
      this.close({ force: true });
    })
  }

  get title() {
    return i18n("midi-qol.ConfigTitle") ?? "Midi-QOL Configuration";
  }

  async getData(options: any): Promise<any> {
    if (!enableWorkflow) {
      ui.notifications?.error("Workflow automation is not enabled")
    }
    let wallsBlockRangeOptions: any = foundry.utils.duplicate(geti18nOptions("WallsBlockRangeOptionsNew"));
    let CoverCalculationOptions: any = foundry.utils.duplicate(geti18nOptions("CoverCalculationOptions"));
    [{ id: "levelsautocover", name: "'Levels Auto Cover'" }, { id: "simbuls-cover-calculator", name: "'Simbuls Cover Calculator'" }, { id: "tokencover", name: "Alternative Token Cover" }].forEach(module => {
      if (!installedModules.get(module.id)) {
        wallsBlockRangeOptions[module.id] += ` - ${game.i18n?.format("MODMANAGE.DepNotInstalled", { missing: module.name })}`;
        CoverCalculationOptions[module.id] += ` - ${game.i18n?.format("MODMANAGE.DepNotInstalled", { missing: module.name })}`;
      }
    });
    if (!installedModules.get("levels")) {
      wallsBlockRangeOptions["centerLevels"] += ` - ${game.i18n?.format("MODMANAGE.DepNotInstalled", { missing: "Levels" })}`;
    }
    let HiddenAdvantageOptions: any = foundry.utils.duplicate(geti18nOptions("HiddenAdvantageOptions"));
    [{ id: "perceptive", name: "Perceptive" }].forEach(module => {
      if (!installedModules.get(module.id)) {
        HiddenAdvantageOptions[module.id] += ` - ${game.i18n?.format("MODMANAGE.DepNotInstalled", { missing: module.name })}`;
      }
    });
    let quickSettingsOptions = {};
    for (let key of Object.keys(quickSettingsDetails)) {
      quickSettingsOptions[key] = quickSettingsDetails[key].description;
    }
    /*
    if (configSettings.addWounded > 0 && ["none", undefined].includes(configSettings.addWoundedStyle))
      configSettings.addWoundedStyle = "normal";
    */
    const AddWoundedOptions = foundry.utils.duplicate(geti18nOptions("AddDeadOptions"));
    delete AddWoundedOptions["none"];
    let rollNPCSavesOptions: any = foundry.utils.duplicate(geti18nOptions("rollNPCSavesOptions"));
    for (let key of Object.keys(rollNPCSavesOptions)) {
      switch (key) {
        case "mtb":
          if (!installedModules.get("monks-tokenbar")) rollNPCSavesOptions[key] = `${rollNPCSavesOptions[key]} - ${game.i18n?.format("MODMANAGE.DepNotInstalled", { missing: "Monks Token Bar" })}`;
          break;
        case "rer":
          if (!installedModules.get("epic-rolls-5e")) rollNPCSavesOptions[key] = `${rollNPCSavesOptions[key]} - ${game.i18n?.format("MODMANAGE.DepNotInstalled", { missing: "Epic Rolls" })}`;
      }
    }
    let playerRollSavesOptions: any = foundry.utils.duplicate(geti18nOptions("playerRollSavesOptions"));
    for (let key of Object.keys(playerRollSavesOptions)) {
      switch (key) {
        case "mtb":
          if (!installedModules.get("monks-tokenbar")) playerRollSavesOptions[key] = `${playerRollSavesOptions[key]} - ${game.i18n?.format("MODMANAGE.DepNotInstalled", { missing: "Monks Token Bar" })}`;
          break;
        case "rer":
          if (!installedModules.get("epic-rolls-5e")) playerRollSavesOptions[key] = `${playerRollSavesOptions[key]} - ${game.i18n?.format("MODMANAGE.DepNotInstalled", { missing: "Epic Rolls" })}`;
      }
    };
    
   let statusEffectList = CONFIG.statusEffects.map((se) => {
       let name = i18n(se.name as string); 
       if (se.id.startsWith("Convenient Effect")) name = `${name} (CE)`; 
       return { id: se.id, name: name } });

    //@ts-expect-error
    const ceInterface = game.dfreds?.effectInterface;
    //@ts-expect-error
    if (ceInterface && foundry.utils.isNewerVersion(game.modules.get("dfreds-convenient-effects")?.version, "6.9")) {
      statusEffectList = statusEffectList.concat(ceInterface.findEffects().map(ae => ({id: `z${ae.flags["dfreds-convenient-effects"].ceEffectId}`, name: `${ae.name} (CE)`})));
    }
    let StatusEffectOptions = statusEffectList.reduce((acc, {id, name}) => { acc[id] = name; return acc }, { "none": "None" });
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
      wallsBlockRangeOptions,
      gmDoReactionsOptions: geti18nOptions("GMDoReactionsOptions"),
      AutoCEEffectsOptions: geti18nOptions("AutoCEEffectsOptions"),
      rollOtherDamageOptions: geti18nOptions("RollOtherDamageOptions"),
      showReactionAttackRollOptions: geti18nOptions("ShowReactionAttackRollOptions"),
      CoverCalculationOptions,
      RecordAOOOptions: geti18nOptions("RecordAOOOptions"),
      EnforceReactionsOptions: geti18nOptions("EnforceReactionsOptions"),
      AutoEffectsOptions: geti18nOptions("AutoEffectsOptions"),
      RequireMagicalOptions: geti18nOptions("RequireMagicalOptions"),
      itemTypeLabels: Object.keys(CONFIG.Item.typeLabels).filter(key => !["backpack", "base"].includes(key)).reduce((acc, key) => { acc[key] = CONFIG.Item.typeLabels[key]; return acc }, {}),
      hasConvenientEffects: installedModules.get("dfreds-convenient-effects"),
      hideRollDetailsOptions: geti18nOptions("hideRollDetailsOptions"),
      checkFlankingOptions: geti18nOptions("CheckFlankingOptions"),
      hideRollDetailsHint: geti18nOptions("HideRollDetails")?.HintLong ?? {},
      nsaFlag,
      coloredBorders,
      playerRollSavesOptions: (autoFastForwardAbilityRolls && false) ? geti18nOptions("playerRollSavesOptionsReduced") : playerRollSavesOptions,
      rollNPCSavesOptions,
      //@ts-ignore .map undefined
      customSoundsPlaylistOptions: game.playlists.contents.reduce((acc, e) => { acc[e.id] = e.name; return acc }, {}) || {},
      //@ts-ignore .sounds
      customSoundOptions: game.playlists?.get(configSettings.customSoundsPlaylist)?.sounds.reduce((acc, s) => { acc[s.id] = s.name; return acc }, { "none": "" }),
      rollSoundOptions: CONFIG.sounds,
      isBetterRolls: installedModules.get("betterrolls5e"),
      rollAlternateOptions: geti18nOptions("RollAlternateOptions"),
      ConsumeResourceOptions: geti18nOptions("ConsumeResourceOptions"),
      AddDeadOptions: geti18nOptions("AddDeadOptions"),
      AddWoundedOptions,
      AverageDamageOptions: geti18nOptions("AverageDamageOptions"),
      TargetConfirmationOptions: geti18nOptions("TargetConfirmationOptions"),
      RemoveConcentrationEffectsOptions: geti18nOptions("RemoveConcentrationEffectsOptions"),
      IncapacitatedOptions: geti18nOptions("IncapacitatedOptions"),
      CheckRangeOptions: geti18nOptions("CheckRangeOptions"),
      InvisAdvantageOptions: geti18nOptions("InvisAdvantageOptions"),
      HiddenAdvantageOptions,
      ConfirmAttackDamageOptions: geti18nOptions("ConfirmAttackDamageOptions"),
      ChallengeModeArmorOptions: geti18nOptions("ChallengeModeArmorOptions"),
      RollSkillsBlindOptions: foundry.utils.mergeObject({ "all": "All" }, Object.keys(GameSystemConfig.skills).reduce((acc, s) => { acc[s] = GameSystemConfig.skills[s].label; return acc }, {})),
      RollSavesBlindOptions: foundry.utils.mergeObject({ "all": "All", "death": i18n("DND5E.DeathSave") }, Object.keys(GameSystemConfig.abilities).reduce((acc, s) => { acc[s] = GameSystemConfig.abilities[s].label; return acc }, {})),
      RollChecksBlindOptions: foundry.utils.mergeObject({ "all": "All" }, Object.keys(GameSystemConfig.abilities).reduce((acc, s) => { acc[s] = GameSystemConfig.abilities[s].label; return acc }, {})),
      midiPropertiesTabOptions: CONST.USER_ROLE_NAMES,
      StatusEffectOptions,
      SaveDROrderOptions: geti18nOptions("SaveDROrderOptions"),
      ColorOptions: colorList.reduce((acc, c) => { acc[c] = c; return acc }, { "Delete": "Delete" }),
      DoConcentrationCheckOptions: geti18nOptions("DoConcentrationCheckOptions"),
      rollModes: CONFIG.Dice.rollModes,
      //@ts-expect-error
      preV12: game.release.generation < 12
    };
    if (debugEnabled > 0) warn("Config Panel: getData ", data)
    return data;
  }

  _onSearch(term) {
    for (let tag of [".midi-qol-box", ".form-group"]) {
      const elts = Array.from(this.element[0].querySelectorAll(tag));
      term = term.toLowerCase().trim();
      elts.forEach((el) => {
        //@ts-expect-error
        if (!term || el.innerText.toLowerCase().includes(term)) {
          //@ts-expect-error
          el.style.display = null;
        } else {
          //@ts-expect-error
          el.style.display = "none";
        }
      });
    }
  }
  activateListeners(html) {
    html.find(".customSounds").change(() => {
      configSettings.useCustomSounds = !configSettings.useCustomSounds;
      this.render(true)
    });

    html.find(".playlist").change(this._playList.bind(this));
    super.activateListeners(html)

    html.find(".itemTypeListEdit").on("click", event => {
      new ItemTypeSelector({}, {}).render(true)
    })
    html.find(".optionalRulesEnabled").on("click", event => {
      configSettings.optionalRulesEnabled = !configSettings.optionalRulesEnabled;
      this.render(true);
    })

    html.find("#midi-qol-show-stats").on("click", event => {
      gameStats.showStats();
    })

    html.find("#midi-qol-export-config").on("click", exportSettingsToJSON)
    html.find("#midi-qol-import-config").on("click", async () => {
      if (await importFromJSONDialog()) {
        this.close({ force: true });
      }
    });
    html.find('.midi-qol-blind-select').hover(this.selectHover.bind(this), this.selectHoverOut.bind(this))
    html.find(".import-quick-setting").on("click", async function (event) {
      const key = event.currentTarget.id;
      if (await applySettings.bind(this)(key)) this.close({ force: true });
      // this.render();
    }.bind(this))

    //activate listeners
    //@ts-expect-error
    this.element[0].querySelector('input[type="search"]')?.addEventListener("input", (e) => { this._onSearch(e.currentTarget?.value) })
  }

  selectHover(event) {
    const target = event.currentTarget;
    target.focus();
  }
  selectHoverOut(event) {
    const target = event.currentTarget;
    target.blur();
  }

  close(options) {
    if (this.configHookId) Hooks.off("midi-qol.ConfigSettingsChanged", this.configHookId);
    return super.close(options);
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
    formData = foundry.utils.expandObject(formData);
    formData.itemTypeList = configSettings.itemTypeList;
    let newSettings = foundry.utils.mergeObject(configSettings, formData, { overwrite: true, inplace: false })
    // const newSettings = foundry.utils.mergeObject(configSettings, expand, {overwrite: true})
    //@ts-expect-error
    if (game.user.can("SETTINGS_MODIFY")) game.settings?.set("midi-qol", "ConfigSettings", newSettings);
  }
}

export class ItemTypeSelector extends FormApplication {

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
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
    // Populate choices
    //@ts-ignore
    const choices: {} = Object.keys(CONFIG.Item.typeLabels).filter(key => !["backpack", "base"].includes(key)).reduce((acc, key) => { acc[key] = CONFIG.Item.typeLabels[key]; return acc }, {});
    for (let [k, v] of Object.entries(choices)) {
      choices[k] = {
        label: i18n(v as string),
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
    new DialogV2({
      window: { title: `Import midi-qol settings` },
      position: {
        width: 400
      },
      content: content,
      buttons: [
        {
          action: "import",
          label: '<i class="fas fa-file-import"></i> Import',
          default: true,
          callback: event => {
            const form = (event.currentTarget as HTMLElement | null)?.querySelector("form");
            if (!form?.data.files.length) return ui.notifications?.error("You did not upload a data file!");
            readTextFromFile(form.data.files[0]).then(json => {
              importSettingsFromJSON(json).then(() => resolve(true))
            });
          }
        },
        {
          action: "no",
          label: '<i class="fas fa-times"></i> Cancel',
          callback: event => resolve(false)
        }
      ],
    }).render({force: true});
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
  const diffs = foundry.utils.diffObject(changed, current, { inner: true });
  const changes: string[] = [];
  for (let key of Object.keys(diffs)) {
    let name: string;
    if (key.startsWith("gm"))
      name = key[2].toUpperCase() + key.substring(3);
    else name = key[0].toUpperCase() + key.substring(1);
    let longName = i18n("midi-qol." + name + ".Name");
    if (longName?.startsWith("midi-qol")) longName = name;
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
    let d = new DialogV2({
      window: { title: dialogTitle },
      content: changes.join("<br>"),
      buttons: [
        {
          action: "apply",
          default: true,
          label: '<i class="fas fa-check"></i> Apply Changes',
          callback: () => resolve(true)
        },
        {
          action: "abort",
          label: '<i class="fas fa-xmark"></i> Don\'t Apply Changes',
          callback: () => resolve(false)
        }
      ],
    }).render({force: true});
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
      gmTargetConfirmation: "none",
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
      gmTargetConfirmation: "none"
    },
  },
  ShowItemInfo: {
    description: "Show Item Info in chat card",
    shortDescription: "Show Item Info",
    configSettings: {
      showItemDetails: "all",
    },
    codeChecks: (current, settings) => {
      settings.itemTypeList = Object.keys(CONFIG.Item.typeLabels).filter(key => !["backpack", "base"].includes(key));
    }
  },
  PlayerAuto: {
    description: "Player Attack/Damage Roll: Automatic",
    shortDescription: "Player Attack/Damage Roll: Automatic",
    configSettings: {
      autoRollAttack: true,
      autoRollDamage: "onHit",
      autoFastForward: "all",
      removeButtons: "all",
      targetConfirmation: "none"
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
      targetConfirmation: "none"
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
      singleConcentrationRoll: true,
    },
    codeChecks: (current, settings) => {
      //@ts-expect-error
      game.settings?.set(game.system?.id, "disableConcentation", false);
    }
  },
  NoDamageApplication: {
    description: "Allow GM to fudge damage application (display but no auto apply)",
    shortDescription: "Allow GM to fudge damage application",
    configSettings: {
      autoApplyDamage: "noCard"
    },
    codeChecks: (current, settings) => {
      //@ts-expect-error
      game.settings?.set("midi-qol", "AddChatDamageButtons", "gm");
    }
  },
  DisableConcentration: {
    description: "Disable Concentration Automation",
    shortDescription: "Disable Concentration Automation",
    configSettings: {
      removeConcentration: false,
      singleConcentrationRoll: false,
    },
    codeChecks: (current, settings) => {
      //@ts-expect-error
      game.settings?.set(game.system?.id, "disableConcentation", true);
    }
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
      if (!installedModules.get("anonymous")) ui.notifications?.warn("'Anonymous' is recommended to hide creature names for normal dnd5e rolls")
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
    settingsToApply = foundry.utils.duplicate(config.configSettings);
    if (config.codeChecks) config.codeChecks(configSettings, settingsToApply)
    if (await showDiffs(configSettings, settingsToApply, "", config.shortDescription)) {
      settingsToApply = foundry.utils.mergeObject(configSettings, settingsToApply, { overwrite: true, inplace: true });
      //@ts-expect-error
      if (game.user?.can("SETTINGS_MODIFY")) game.settings?.set("midi-qol", "ConfigSettings", settingsToApply);
      return true;
    }
  } else if (config.fileName) {
    try {
      const jsonText = await fetchConfigFile(PATH + config.fileName);
      const configData = JSON.parse(jsonText);
      if (await showDiffs(configSettings, configData.configSettings, "", config.shortDescription)) {
        importSettingsFromJSON(jsonText);
      }
      return true;
    } catch (err) {
      error("could not load config file", config.fileName, err);
    }
    log(`Loaded ${config.fileName} version ${config.version}`);
  }
  return false;
}
const colorList = [
  `AliceBlue`,
  `AntiqueWhite`,
  `Aqua`,
  `Aquamarine`,
  `Azure`,
  `Beige`,
  `Bisque`,
  `Black`,
  `BlanchedAlmond`,
  `Blue`,
  `BlueViolet`,
  `Brown`,
  `BurlyWood`,
  `CadetBlue`,
  `Chartreuse`,
  `Chocolate`,
  `Coral`,
  `CornflowerBlue`,
  `Cornsilk`,
  `Crimson`,
  `Cyan`,
  `DarkBlue`,
  `DarkCyan`,
  `DarkGoldenRod`,
  `DarkGray`,
  `DarkGrey`,
  `DarkGreen`,
  `DarkKhaki`,
  `DarkMagenta`,
  `DarkOliveGreen`,
  `Darkorange`,
  `DarkOrchid`,
  `DarkRed`,
  `DarkSalmon`,
  `DarkSeaGreen`,
  `DarkSlateBlue`,
  `DarkSlateGray`,
  `DarkSlateGrey`,
  `DarkTurquoise`,
  `DarkViolet`,
  `DeepPink`,
  `DeepSkyBlue`,
  `DimGray`,
  `DimGrey`,
  `DodgerBlue`,
  `FireBrick`,
  `FloralWhite`,
  `ForestGreen`,
  `Fuchsia`,
  `Gainsboro`,
  `GhostWhite`,
  `Gold`,
  `GoldenRod`,
  `Gray`,
  `Grey`,
  `Green`,
  `GreenYellow`,
  `HoneyDew`,
  `HotPink`,
  `IndianRed`,
  `Indigo`,
  `Ivory`,
  `Khaki`,
  `Lavender`,
  `LavenderBlush`,
  `LawnGreen`,
  `LemonChiffon`,
  `LightBlue`,
  `LightCoral`,
  `LightCyan`,
  `LightGoldenRodYellow`,
  `LightGray`,
  `LightGrey`,
  `LightGreen`,
  `LightPink`,
  `LightSalmon`,
  `LightSeaGreen`,
  `LightSkyBlue`,
  `LightSlateGray`,
  `LightSlateGrey`,
  `LightSteelBlue`,
  `LightYellow`,
  `Lime`,
  `LimeGreen`,
  `Linen`,
  `Magenta`,
  `Maroon`,
  `MediumAquaMarine`,
  `MediumBlue`,
  `MediumOrchid`,
  `MediumPurple`,
  `MediumSeaGreen`,
  `MediumSlateBlue`,
  `MediumSpringGreen`,
  `MediumTurquoise`,
  `MediumVioletRed`,
  `MidnightBlue`,
  `MintCream`,
  `MistyRose`,
  `Moccasin`,
  `NavajoWhite`,
  `Navy`,
  `OldLace`,
  `Olive`,
  `OliveDrab`,
  `Orange`,
  `OrangeRed`,
  `Orchid`,
  `PaleGoldenRod`,
  `PaleGreen`,
  `PaleTurquoise`,
  `PaleVioletRed`,
  `PapayaWhip`,
  `PeachPuff`,
  `Peru`,
  `Pink`,
  `Plum`,
  `PowderBlue`,
  `Purple`,
  `Red`,
  `RosyBrown`,
  `RoyalBlue`,
  `SaddleBrown`,
  `Salmon`,
  `SandyBrown`,
  `SeaGreen`,
  `SeaShell`,
  `Sienna`,
  `Silver`,
  `SkyBlue`,
  `SlateBlue`,
  `SlateGray`,
  `SlateGrey`,
  `Snow`,
  `SpringGreen`,
  `SteelBlue`,
  `Tan`,
  `Teal`,
  `Thistle`,
  `Tomato`,
  `Turquoise`,
  `Violet`,
  `Wheat`,
  `White`,
  `WhiteSmoke`,
  `Yellow`,
  `YellowGreen`,
]