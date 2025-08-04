import { i18n, systemConcentrationId, error } from "../../midi-qol.js";
import { autoApplyDamageOptions, autoCEEffectsOptions, autoCheckHitOptions, autoCheckSavesOptions, autoEffectsOptions, autoTargetOptions, CheckedAuthorsList, checkedModuleList, checkMechanic, collectSettingData, configSettings, coverCalculationOptions, enableWorkflow, exportSettingsToJSON, fetchParams, importSettingsFromJSON, rangeTargetOptions, safeGetGameSetting } from "../settings.js";
import { REQUIRED_MODULE_VERSIONS, getModuleVersion, installedModules } from "../setupModules.js";
const { ApplicationV2, DialogV2, HandlebarsApplicationMixin } = foundry.applications.api;

const minimumMidiVersion = "11.0.7";

export class TroubleShooter extends HandlebarsApplicationMixin(ApplicationV2) {
  public static errors: { timestamp: number, timeString: string, error: any, message: string | undefined }[] = [];
  public static MAX_ERRORS = 10;
  static _data: TroubleShooterData;
  public static set data(data) { this._data = data };
  public static get data() { return this._data }
  // @ts-expect-error will be replaced in v2 anyway (which I have yet to do)
  _fixerId: number;
  // @ts-expect-error will be replaced in v2 anyway (which I have yet to do)
  _fixerFuncs: Array<(app) => void>
  get nextFixerId() { this._fixerId += 1; return this._fixerId }
  _hookId;

  constructor(...args) {
    super(...args);
    TroubleShooter.data = TroubleShooter.collectTroubleShooterData();
    //@ts-expect-error
    this._hookId = Hooks.on("midi-qol.TroubleShooter.recordError", (errorDetail) => {
      if (TroubleShooter.data.isLocal) {
        TroubleShooter.data = TroubleShooter.collectTroubleShooterData();
        this.render({force: true});
      }
    });
    return this;
  }

  // async render(options?) {
  //   await super.render(options);
  //   if (options.tab) this._tabs[0].activate(options.tab);
  //   return this;
  // }

  static override DEFAULT_OPTIONS = {
    id: "midi-trouble-shooter",
    classes: ["midi-trouble-shooter"],
    window: {
      title: "midi-qol.TroubleShooter.Label",
      resizable: true,
      contentClasses: ["standard-form"]
    },
    position: {
      height: "auto" as "auto",
      width: 900
    },
    form: {
      closeOnSubmit: false
    },
    actions: {
      export: TroubleShooter.#onExport,
      import: TroubleShooter.#onImport,
      refresh: TroubleShooter.#onRefresh,
      clear: TroubleShooter.#onClear,
      overwrite: TroubleShooter.#onOverwrite
    }
  };

  static override PARTS = {
    tabs: {template: "templates/generic/tab-navigation.hbs"},
    summary: {template: "modules/midi-qol/templates/troubleshooter/summary.hbs"},
    common: {template: "modules/midi-qol/templates/troubleshooter/common.hbs"},
    problems: {template: "modules/midi-qol/templates/troubleshooter/problems.hbs"},
    errors: {template: "modules/midi-qol/templates/troubleshooter/errors.hbs"},
    modules: {template: "modules/midi-qol/templates/troubleshooter/modules.hbs"},
    footer: {template: "templates/generic/form-footer.hbs"}
  }

  // V13 version:
  // static TABS = {
  //   sheet: {
  //     tabs: [
  //       {id: "summary"},
  //       {id: "common"},
  //       {id: "problems"},
  //       {id: "errors"},
  //       {id: "modules"}
  //     ],
  //     initial: "summary",
  //     labelPrefix: "midi-qol.TroubleShooter.Tabs"
  //   }
  // }

  // V12 version:
  tabGroups = {
    sheet: "summary"
  }

  public static recordError(err, message?: string | undefined) {
    if (!this.errors) this.errors = [];
    while (this.errors.length >= this.MAX_ERRORS) this.errors.shift();
    const timestamp = Date.now()
    const timeString = `${new Date(timestamp).toLocaleDateString()} - ${new Date(timestamp).toLocaleTimeString()}`;
    const stack = err.stack?.split("\n").map(s => removeIpAddressAndHostName(s));
    const errorDetail = { timestamp, timeString, error: { message: err.message, stack }, message };
    this.errors.push(errorDetail);
    //@ts-expect-error
    Hooks.callAll("midi-qol.TroubleShooter.recordError", errorDetail);
  }

  public static clearErrors() {
    this.errors = [];
  }
  public static logErrors() {
  }
  async _updateObject(event, formData) {
  };

  public static exportTroubleShooterData() {
    const data = TroubleShooter.collectTroubleShooterData();
    const filename = "fvtt-midi-qol-troubleshooter.json"
    saveDataToFile(JSON.stringify(data, null, 2), "text/json", filename);
  }
  public static async importTroubleShooterDataFromJSONDialog() {
    const content = await foundry.applications.handlebars.renderTemplate("templates/apps/import-data.hbs",
      { hint1: "Choose a Trouble Shooter JSON file to import" });
    let dialog = new Promise((resolve, reject) => {
      new DialogV2({
        window: { title: `Import Trouble Shooter Data` },
        classes: ["midi-qol-import-troubleshooter"],
        content: content,
        position: {
          width: 400,
          height: "auto"
        },
        buttons: [
          {
            action: "import",
            icon: "fa-solid fa-file-import",
            label: 'Import',
            default: true,
            callback: event => {
              const form = (event.currentTarget as HTMLElement | null)?.querySelector("form");
              if (!form?.data.files.length) return ui.notifications?.error("You did not upload a data file!");
              readTextFromFile(form.data.files[0]).then(json => {
                const jsonData = JSON.parse(json);
                if (foundry.utils.isNewerVersion(minimumMidiVersion, jsonData.midiVersion ?? "0.0.0")) {
                  ui.notifications?.error("Trouble Shooter Data is too old to use");
                  resolve(false);
                  return;
                }
                jsonData.isLocal = false;
                jsonData.fileName = form.data.files[0].name;
                TroubleShooter.data = jsonData;
                for (let error of TroubleShooter.data.errors) {
                  error.timeString = `${new Date(error.timestamp).toLocaleDateString()} - ${new Date(error.timestamp).toLocaleTimeString()}`;

                }
                resolve(true);
              });
            }
          },
          {
            action: "no",
            icon: "fa-solid fa-xmark",
            label: 'Cancel',
            callback: event => resolve(false)
          }
        ],
      }).render({force: true});
    });
    return await dialog;
  }
  public static getDetailedSettings(moduleId: string): any {
    const returnValue = {};
    let settings = Array.from(game.settings.settings ?? []).filter(i => i[0].includes(moduleId) && i[1].namespace === moduleId);
    settings.forEach(i => {
      if (typeof i[1].name !== "string") return;
      if (!i[1].config) return;
      let value: any = safeGetGameSetting(moduleId, i[1].key);
      if (typeof value !== "string") value = JSON.stringify(value);
      returnValue[i18n(i[1].name)] = value;
    });
    return returnValue;
  }
  static async troubleShooter(app) {
    await TroubleShooter.exportTroubleShooterData();
  }

  async _onSubmit(...args): Promise<any> {
    let [event, options] = args;
    // error("On Submit", event, options.updateData, options.preventClose, options.preventRender);
    return {};
  }

  async _preClose(options) {
    await super._preClose(options);
    //@ts-expect-error
    Hooks.off("midi-qol.TroubleShooter.recordError", this._hookId);
  }

  static #onExport(event) {
    event.preventDefault();
    event.stopPropagation();
    TroubleShooter.exportTroubleShooterData();
  }

  static async #onImport(event) {
    event.preventDefault();
    event.stopPropagation();
    if (await TroubleShooter.importTroubleShooterDataFromJSONDialog()) {
      // @ts-expect-error
      this.render({force: true})
    }
  }

  static #onRefresh(event) {
    event.preventDefault();
    event.stopPropagation();
    TroubleShooter.data = TroubleShooter.collectTroubleShooterData();
    // @ts-expect-error
    this.render({force: true});
  }

  static #onClear(event) {
    event.preventDefault();
    event.stopPropagation();
    TroubleShooter.clearErrors();
    TroubleShooter.data = TroubleShooter.collectTroubleShooterData();
    // @ts-expect-error
    this.render({force: true});
  }

  static #onOverwrite(event) {
    event.preventDefault();
    event.stopPropagation();
    // @ts-expect-error
    this.overWriteMidiSettings();
  }

  async _onRender(context, options) {
    super._onRender(context, options);
    for (let i = 0; i < this._fixerFuncs.length; i++) {
      const id = `#fixer-${i + 1}`;
      const fixerFunc = this._fixerFuncs[i];
      const app = this;
      this.element.querySelector(id)?.addEventListener("click", function(event) {
        event.preventDefault();
        event.stopPropagation();
        fixerFunc(app);
      });
    }
  }

  async overWriteMidiSettings(): Promise<boolean> {
    if (!game.user?.isGM) {
      ui.notifications?.error("Only a GM can overwrite midi settings")
      return false;
    }
    if (TroubleShooter.data.isLocal) {
      ui.notifications?.warn(`midi-qol | Cant set midi settings - you have not loaded external trouble shooter data`)
      return false;
    }
    let dialog: Promise<boolean> = new Promise((resolve, reject) => {
      new DialogV2({
        window: { title: `Overwrite midi-qol settings from loaded file` },
        content: `<p>This will <strong><em>permanently</em></strong> overwrite your midi settings</p>`,
        position: {
          width: 400,
          height: "auto"
        },
        buttons: [
          {
            action: "overwrite",
            icon: "fa-solid fa-file-import",
            label: 'Overwrite',
            callback: async (event) => {
              await exportSettingsToJSON(); // Just a safety net saving of the settings
              const settingsJSON = TroubleShooter.data.midiSettings;
              importSettingsFromJSON(settingsJSON);
              //@ts-expect-error
              Hooks.callAll("midi-qol.configSettingsChanged");
              resolve(true);
            }
          },
          {
            action: "cancel",
            default: true,
            icon: "fa-solid fa-xmark",
            label: 'Cancel',
            callback: event => resolve(false)
          }
        ],
      }).render({force: true});
    });
    return await dialog;
  }

  async _prepareContext(options) {
    let context: any = foundry.utils.deepClone(TroubleShooter.data);
    context = foundry.utils.mergeObject(await super._prepareContext(options), context, {inplace: false});
    context.hasIncompatible = context.summary.incompatible.length > 0;
    context.hasOutOfDate = context.summary.outOfDate.length > 0;
    context.hasPossibleOutOfData = context.summary.possibleOutOfDate.length > 0;
    context.hasProblems = context.problems.length > 0;
    context.hasErrors = context.errors.length > 0;
    context.hasFoundryModuleProblems = !foundry.utils.isEmpty(context.summary.foundryModuleIssues);
    this._fixerId = 0;
    this._fixerFuncs = [];
    const excludeFoundryWarnings = true;
    if (excludeFoundryWarnings) {
      for (let key of Object.keys(context.summary.foundryModuleIssues)) {
        const problem = context.summary.foundryModuleIssues[key];
        if (problem.error.length === 0) {
          delete context.summary.foundryModuleIssues[key];
        } else delete problem.warning;
      }
    }
    for (let problem of context.problems) {
      if (problem.problemDetail) problem.problemDetail = JSON.stringify(problem.problemDetail);
      if (problem.fixerFunc) {
        problem.hasFixerFunc = true;
        problem.fixerId = this.nextFixerId;
        this._fixerFuncs.push(problem.fixerFunc);
      }
    }
    context.buttons = [
      {
        type: "button",
        action: "refresh",
        icon: "fa-solid fa-gears",
        label: "MENU.Reload"
      },
      {
        type: "button",
        action: "clear",
        icon: "fa-solid fa-gears",
        label: "midi-qol.TroubleShooter.ClearErrors"
      },
      {
        type: "button",
        action: "export",
        icon: "fa-solid fa-floppy-disk",
        label: "SIDEBAR.Export"
      },
      {
        type: "button",
        action: "import",
        icon: "fa-solid fa-file-import",
        label: "SIDEBAR.Import"
      },
      {
        type: "button",
        action: "overwrite",
        icon: "fa-solid fa-download",
        label: "midi-qol.TroubleShooter.Overwrite"
      }
    ]
    // V12-only:
    context.tabs = this.#getTabs();
    return context;
  }

  // V12-only:
  #getTabs() {
    const tabs = {
      summary: {id: "summary", group: "sheet", label: "midi-qol.TroubleShooter.Tabs.summary", active: true},
      common: {id: "common", group: "sheet", label: "midi-qol.TroubleShooter.Tabs.common"},
      problems: {id: "problems", group: "sheet", label: "midi-qol.TroubleShooter.Tabs.problems"},
      errors: {id: "errors", group: "sheet", label: "midi-qol.TroubleShooter.Tabs.errors"},
      modules: {id: "modules", group: "sheet", label: "midi-qol.TroubleShooter.Tabs.modules"}
    };
    return tabs;
  }

  // V12-only (I think):
  async _preparePartContext(partId, context) {
    if (Object.keys(context.tabs).includes(partId)) {
      context.tab = context.tabs[partId];
    }
    return context;
  }

  public static collectTroubleShooterData() {
    let data: TroubleShooterData = {
      midiVersion: game.modules.get("midi-qol")?.version as string,
      isLocal: true,
      fileName: "Local Settings",
      summary: {},
      problems: [],
      modules: {},
      errors: {},
      midiSettings: {}
    };

    const gameVersion = game.version ?? "unknown";
    const gameSystemId = game.system?.id;
    if (!gameSystemId) return data;
    data.summary.gameSystemId = gameSystemId;
    data.summary = {
      "foundry-version": gameVersion,
      "Game System": gameSystemId,
      "Game System Version": game.system?.version,
      "midi-qol-version": game.modules.get("midi-qol")?.version,
      "Dynamic Active Effects Version": game.modules.get("dae")?.version,
      "coreSettings": {
        "Photo Sensitivity": safeGetGameSetting("core", "photosensitiveMode")
      },
      "gameSystemSettings": {
        "Diagonal Distance Setting": safeGetGameSetting(gameSystemId, "diagonalMovement"),
        "Proficiency Variant": safeGetGameSetting(gameSystemId, "proficiencyModifier"),
        "Collapse Item Cards": safeGetGameSetting(gameSystemId, "autoCollapseItemCards"),
        "Critical Damage Maximize Dice": safeGetGameSetting(gameSystemId, "criticalDamageMaxDice"),
        "Critical Damage Modifiers": safeGetGameSetting(gameSystemId, "criticalDamageModifiers"),
        "Concentration Disabled": safeGetGameSetting(gameSystemId, "disableConcentration"),
      },
      "moduleSettings": {}
    }
    if (canvas.scene) {
      const globalIllumination = canvas.scene?.environment?.globalLight?.enabled;
      data.summary["coreSettings"]["Scene Details"] =
        `${canvas.scene.dimensions.height} x ${canvas.scene.dimensions.width} | Size: ${canvas.scene.grid.size} | Type: ${Object.keys(CONST.GRID_TYPES)[canvas.scene.grid.type]} | Distance: ${canvas.scene.grid.distance} | Global Illumination ${globalIllumination}`;

      const sceneObjects = ["tokens", "sounds", "tiles", "walls", "lights", "templates", "notes"];
      const report: string[] = []
      for (let c of sceneObjects) {
        const collection = canvas.scene[c];
        report[c] = `${c} ${collection.size}${collection.invalidDocumentIds.size > 0 ?
          ` (${collection.invalidDocumentIds.size} ${i18n("Invalid")})` : ""}`;
      }
      data.summary["coreSettings"]["Scene Objects"] = Object.values(report).join(" | ");
    }
    const report: string[] = []
    const reportCollections = ["actors", "items", "journal", "tables", "playlists", "messages"];
    for (let c of reportCollections) {
      const collection = game[c];
      report[c] = `${c} ${collection.size}${collection.invalidDocumentIds.size > 0 ?
        ` (${collection.invalidDocumentIds.size} ${i18n("Invalid")})` : ""}`;
    }
    data.summary["coreSettings"]["World Object counts"] = Object.values(report).join(" | ");
    data.summary["coreSettings"]["Module Count"] = `Active: ${game.modules.filter(m => m.active).length} | Installed: ${game.modules.size}`;
    if (game.modules.get("ActiveAuras")?.active) {
      data.summary.moduleSettings["Active Auras In Combat"] = safeGetGameSetting("ActiveAuras", "combatOnly");
    }
    if (game.modules.get("ddb-importer")?.active) {
    } else data.summary.moduleSettings["DDB Importer"] = i18n("midi-qol.Inactive");
    if (game.modules.get("dfreds-convenient-effects")?.active) {
      data.summary.moduleSettings["Convenient Effects Modify Status Effects"] = safeGetGameSetting("dfreds-convenient-effects", "modifyStatusEffects");
    } else data.summary.moduleSettings["Convenient Effects"] = i18n("midi-qol.Inactive");
    if (game.modules.get("monks-little-details")?.active) {
      data.summary.moduleSettings["Monk's Little Details Status Effects"] = safeGetGameSetting("monks-little-details", "add-extra-statuses");
      data.summary.moduleSettings["Monk's Little Clear Targets"] = safeGetGameSetting("monks-little-details", "clear-targets");
      data.summary.moduleSettings["Monk's Little Remember Targets"] = safeGetGameSetting("monks-little-details", "remember-previous");
    } else data.summary.moduleSettings["Monk's Little Details"] = i18n("midi-qol.Inactive");
    if (game.modules.get("monks-tokenbar")?.active) {
      data.summary.moduleSettings["Monk's Token Bar Allow Players to use"] = safeGetGameSetting("monks-tokenbar", "allow-player");
    } else data.summary.moduleSettings["Monks Token Bar"] = i18n("midi-qol.Inactive");
    if (game.modules.get("sequencer")?.active) {
      data.summary.moduleSettings["Sequencer Enable Effects"] = safeGetGameSetting("sequencer", "effectsEnabled");
      data.summary.moduleSettings["Sequencer Enable Sounds"] = safeGetGameSetting("sequencer", "soundsEnabled")
    } else data.summary.moduleSettings["Sequencer"] = i18n("midi-qol.Inactive");
    if (game.modules.get("times-up")?.active) {
      data.summary.moduleSettings["Times Up Disable Passive Effects Expiry"] = safeGetGameSetting("times-up", "DisablePassiveEffects");
    } else data.summary.moduleSettings["Times-Up"] = i18n("midi-qol.Inactive");
    if (game.modules.get("tokenmagic")?.active) {
      data.summary.moduleSettings["Token Magic FX Automatic Template Effects "] = safeGetGameSetting("tokenmagic", "autoTemplateEnabled");
      data.summary.moduleSettings["Token Magic FX Default Template Grid on Hover "] = safeGetGameSetting("tokenmagic", "defaultTemplateOnHover");
      data.summary.moduleSettings["Token Magic FX Auto Hide Template Elements "] = safeGetGameSetting("tokenmagic", "autohideTemplateElements");
    } else data.summary.moduleSettings["Token Magic FX"] = i18n("midi-qol.Inactive");

    data.summary.midiSettings = {};
    data.summary.midiSettings["Enable Roll Automation Support (Client Setting)"] = enableWorkflow;
    data.summary.midiSettings["Auto Target on Template Draw"] = autoTargetOptions[configSettings.autoTarget];
    data.summary.midiSettings["Auto Target for Ranged Targets/Spells"] = rangeTargetOptions[configSettings.rangeTarget];
    data.summary.midiSettings["Auto Apply Item Effects"] = autoEffectsOptions[configSettings.autoItemEffects];
    data.summary.midiSettings["Apply Convenient Effects"] = autoCEEffectsOptions[configSettings.autoCEEffects];
    data.summary.midiSettings["Auto Check Hits"] = autoCheckHitOptions[configSettings.autoCheckHit];
    data.summary.midiSettings["Roll Seperate Attacks per Target"] = configSettings.attackPerTarget;
    data.summary.midiSettings["Auto Check Saves"] = autoCheckSavesOptions[configSettings.autoCheckSaves];
    data.summary.midiSettings["Auto Apply Damage to Target"] = autoApplyDamageOptions[configSettings.autoApplyDamage];
    // data.summary.midiSettings["Enable Concentration Automation"] = configSettings.concentrationAutomation;
    data.summary.midiSettings["Expire 1Hit/1Attack/1Action on roll"] = checkMechanic("actionSpecialDurationImmediate");
    data.summary.midiSettings["Inapacitated Actors can't Take Actions"] = checkMechanic("incapacitated");
    data.summary.midiSettings["Calculate Cover"] = coverCalculationOptions[configSettings.optionalRules.coverCalculation];
    data.summary.midiSettings["Add Fake GM Dice"] = configSettings.addFakeDice;
    data.summary.knownModules = {};
    let tempModules = {};
    // Find modules by id
    checkedModuleList.forEach(matcher => {
      const modules = game.modules.filter(m => !!m.id.match(matcher)) ?? [];
      if (modules.length > 0) {
        modules.forEach(module => {
          foundry.utils.setProperty(tempModules, module.id, { title: module.title, active: module.active, installed: true, moduleVersion: module.version, foundryVersion: module.compatibility?.verified });
        })
      } else {
        foundry.utils.setProperty(tempModules, matcher.toString(), { title: "Not installed", active: false, installed: false, moduleVersion: ``, foundryVersion: `` });
      }
    });
    const baseVersion = game.version?.slice(0, 2) ?? "unknown";
    const maxVersion = baseVersion + ".999";
    CheckedAuthorsList.forEach(matcher => {
      // @ts-expect-error
      const modules = game.modules.filter(m => m.authors.find(au => au.name.toLocaleLowerCase().match(matcher))) ?? [];
      if (modules.length > 0) {
        modules.forEach(module => {
          foundry.utils.setProperty(tempModules, module.id, { title: module.title, active: module.active, installed: true, moduleVersion: module.version, foundryVersion: module.compatibility?.verified });
        })
      }
    });
    Object.keys(tempModules)
      .sort((m1, m2) => m1 < m2 ? -1 : m1 > m2 ? 1 : 0)
      .forEach(key => { data.summary.knownModules[key] = tempModules[key] });
    /*
    checkedModuleList.forEach(moduleId => {
      const moduleData = game.modules.get(moduleId);
      if (moduleData)
        //@ts-expect-error .version
        foundry.utils.setProperty(data.summary.knownModules, moduleId, { title: moduleData.title, active: moduleData?.active, installed: true, moduleVersion: moduleData?.version, foundryVersion: moduleData.compatibility?.verified });
      else
        foundry.utils.setProperty(data.summary.knownModules, moduleId, { title: "Not installed", active: false, installed: false, moduleVersion: ``, foundryVersion: `` });
    });
    */

    for (let moduleData of game.modules ?? []) {
      let module: any = moduleData;
      if (!module.active && !checkedModuleList.includes(module.id)) continue;
      let idToUse = module.id;
      let titleToUse = module.title;
      if (idToUse.match(/plutonium/i) || titleToUse.match(/plutonium/i)) {
        idToUse = idToUse.replace(/plutonium/i, "xxxxxxxxx");
        titleToUse = titleToUse.replace(/plutonium/i, "xxxxxxxxx")
        data.summary.moduleSettings["xxxxxxxxx detected"] = "incompatible importer found";
      };
      data.modules[idToUse] = {
        title: titleToUse,
        active: module.active,
        installed: true,
        version: module.version,
        compatibility: module.compatibility?.verified
      }
      switch (module.id) {
        case "ATL":
          foundry.utils.setProperty(data.modules[module.id], "settings", TroubleShooter.getDetailedSettings(module.id));
          break;
        case "ActiveAuras":
          foundry.utils.setProperty(data.modules[module.id], "settings", TroubleShooter.getDetailedSettings(module.id));
          break;
        case "about-time":
          break;
        case "anonymous":
          foundry.utils.setProperty(data.modules[module.id], "settings", TroubleShooter.getDetailedSettings(module.id));
          break;
        case "autoanimations":
          foundry.utils.setProperty(data.modules[module.id], "settings", TroubleShooter.getDetailedSettings(module.id));
          if (game.modules.get("autoanimations")?.active) this.checkAutoAnimations(data);
          break;
        case "combat-utility-belt":
          break;
        case "condition-lab-triggler":
          foundry.utils.setProperty(data.modules[module.id], "settings", TroubleShooter.getDetailedSettings(module.id));
          break;
        case "dae":
          foundry.utils.setProperty(data.modules[module.id], "settings", TroubleShooter.getDetailedSettings(module.id));
          break;
        case "ddb-game-log":
          break;
        case "df-templates":
          foundry.utils.setProperty(data.modules[module.id], "settings", TroubleShooter.getDetailedSettings(module.id));
          break;
        case "dfreds-convenient-effects":
          foundry.utils.setProperty(data.modules[module.id], "settings", TroubleShooter.getDetailedSettings(module.id));

          break;
        case "dice-so-nice":
          break;
        case "effect-macro":
          foundry.utils.setProperty(data.modules[module.id], "settings", TroubleShooter.getDetailedSettings(module.id));
          break;
        case "foundryvtt=simple-calendar":
          foundry.utils.setProperty(data.modules[module.id], "settings", TroubleShooter.getDetailedSettings(module.id));
          break;
        case "itemacro":
          foundry.utils.setProperty(data.modules[module.id], "settings", TroubleShooter.getDetailedSettings(module.id));
          this.checkItemMacro(data);
          break;
        case "levels":
          foundry.utils.setProperty(data.modules[module.id], "settings", TroubleShooter.getDetailedSettings(module.id));
          break;
        case "levelsautocover":
          foundry.utils.setProperty(data.modules[module.id], "settings", TroubleShooter.getDetailedSettings(module.id));
          break;
        case "levelsvolumetrictemplates":
          foundry.utils.setProperty(data.modules[module.id], "settings", TroubleShooter.getDetailedSettings(module.id));
          break;
        case "lib-wrapper":
          if (!(game.modules.get("lib-wrapper")?.active)) {
            data.problems.push({
              moduleId: "lib-wrapper",
              severity: "Error",
              critical: true,
              problemSummary: "Midi won't function without lib-wrapper",
              fixer: "Install and activate lib-wrapper",
              problemDetail: undefined
            });
          };
          break;
        case "lmrtfy":
          break;
        case "midi-qol":
          foundry.utils.setProperty(data.modules[module.id], "settings", TroubleShooter.getDetailedSettings(module.id));
          break;
        case "monks-combat-details":
          if (safeGetGameSetting("monks-combat-details", "auto-defeated") !== "none" && configSettings.addDead !== "none") {
            data.problems.push({
              moduleId: "monks-combat-details",
              severity: "Error",
              problemSummary: "Both Midi and Monks Combat Details are adding defeated effects",
              fixer: "Disable defeated effects in one of the modules",
              problemDetail: undefined
            });
          }
          break;
        case "monks-little-details":
          foundry.utils.setProperty(data.modules[module.id], "settings", TroubleShooter.getDetailedSettings(module.id));
          break;
        case "monks-tokenbar":
          foundry.utils.setProperty(data.modules[module.id], "settings", TroubleShooter.getDetailedSettings(module.id));
          break;
        case "multilevel-tokens":
          break;
        case "simbuls-cover-calculator":
          break;
        case "socketlib":
          if (!(game.modules.get("socketlib")?.active)) {
            data.problems.push({
              moduleId: "socketlib",
              severity: "Error",
              critical: true,
              problemSummary: "Midi won't function without socketlib",
              fixer: "Install and activate socketlib",
              problemDetail: undefined
            });
          };
          break;
        case "times-up":
          if (!(game.modules.get("times-up")?.active)) {
            data.problems.push({
              moduleId: "times-up",
              severity: "Warn",
              problemSummary: "Times Up is not installed or not active. Effects won't expire",
              fixer: "Install and activate times-up",
              problemDetail: undefined
            });
          };
          foundry.utils.setProperty(data.modules[module.id], "settings", TroubleShooter.getDetailedSettings(module.id));
          break;
        case "walledtemplates":
          this.checkWalledTemplates(data);
          break;
        case "warpgate":
          foundry.utils.setProperty(data.modules[module.id], "settings", TroubleShooter.getDetailedSettings(module.id));
          // if (game.modules.get("warpgate")?.active) TroubleShooter.checkWarpgateUserPermissions(data);
          break;
        case "wjmaia":
          break;
        case "advancedspelleffects":
        case "attack-roll-check-5e":
        case "betterrolls5e":
        case "dice-rng-protector":
        case "effective-transferral":
        case "fast-rolls":
        case "faster-rolling-by-default-5e":
        case "gm-paranoia-taragnor":
        case "max-crit":
        case "mre-dnd5e":
        case "multiattack-5e":
        case "obsidian":
        case "quick-rolls":
        case "ready-set-roll-5e":
        case "roll-tooltips-5e":
        case "retroactive-advantage-5e":
        case "rollgroups":
        case "wire":
          data.modules[module.id].incompatible = true;
          break;
      }
    }
    // Check Incompatible modules
    data.summary.incompatible = Object.keys(data.modules)
      .filter(key => data.modules[key].incompatible)
      .map(key => ({ key, title: data.modules[key].title }));

    data.summary.foundryModuleIssues = foundry.utils.duplicate(game.issues?.packageCompatibilityIssues);
    for (let key in data.summary.foundryModuleIssues) {
      const issue: any = data.summary.foundryModuleIssues[key];
      issue.title = game.modules.get(key)?.title;
      delete issue.manifest;
    }

    data.summary.outOfDate = Object.keys(data.modules)
      .filter(key => foundry.utils.isNewerVersion(baseVersion, data.modules[key].compatibility ?? 0))
      .map(key => {
        const versionString = `${data.modules[key].active ? i18n("midi-qol.Active") : i18n("midi-qol.Inactive")} ${data.modules[key].version}`
        return {
          key,
          title: data.modules[key].title,
          active: data.modules[key].active,
          moduleVersion: data.modules[key].version, //versionString,
          foundryVersion: data.modules[key].compatibility
        }
      });
    data.summary.possibleOutOfDate = Object.keys(data.modules).filter(key => {
      let moduleVersion = data.modules[key].compatibility ?? "0.0.0";
      if (moduleVersion === baseVersion) moduleVersion = maxVersion
      // if (!data.modules[key].active) return false;
      if (foundry.utils.isNewerVersion(baseVersion, moduleVersion)) return false;
      return foundry.utils.isNewerVersion(gameVersion, moduleVersion)
    }).map(key =>
    ({
      key,
      title: data.modules[key].title,
      active: data.modules[key].active,
      moduleVersion: data.modules[key].version,
      version: data.modules[key].compatibility
    }));
    for (let key of Object.keys(REQUIRED_MODULE_VERSIONS)) {
      if (game.modules.get(key)?.active) {
        const installedVersion = getModuleVersion(key);
        const requiredVersion = REQUIRED_MODULE_VERSIONS[key];
        if (foundry.utils.isNewerVersion(requiredVersion, installedVersion)) {
          data.problems.push({
            moduleId: key,
            severity: "Error",
            problemSummary: `${key} needs to be at least version ${requiredVersion} but is version ${installedVersion} and will not be used`,
            fixer: `Update ${key} to latest version`,
            problemDetail: undefined
          });
        }
      }
    }

    data.summary.foundryReportedErrors
    let midiSettings: any = foundry.utils.duplicate(collectSettingData());
    delete midiSettings.flags;
    data.midiSettings = midiSettings;
    TroubleShooter.checkCommonProblems(data);
    data.errors = foundry.utils.duplicate(TroubleShooter.errors).reverse();
    return data;
  }

  public static checkConcentrationStatusEffects(data: TroubleShooterData) {
    if (safeGetGameSetting(game.system?.id ?? "dnd5e", "disableConcentration")) return;
    let severity: "Error" | "Warn" = "Error";
    let statusEffect = CONFIG.statusEffects.find(e => e.id === systemConcentrationId);

    if (!statusEffect) {
      data.problems.push({
        moduleId: "midi-qol",
        severity,
        problemSummary: `Concentration Automation is enabled but the status effect with id "${systemConcentrationId}" was not found.`,
        problemDetail: undefined,
        fixer: "Check which module is removing the concentrating status effect"
      });
    }
  }

  public static checkMidiCoverSettings(data: TroubleShooterData) {
    switch (configSettings.optionalRules.wallsBlockRange) {
      case "none":
        break;
      case "center":
        break;
      case "centerLevels":
        if (!(game.modules.get("levels")?.active)) {
          data.problems.push({
            moduleId: "levels",
            severity: "Error",
            problemSummary: "You must enable the 'levels' module to use the 'Center Levels' option for 'Walls Block Range'",
            problemDetail: undefined,
            fixer: "Enable the 'levels' module"
          });
        }
        break;
      case "levelsautocover":
        if (!(game.modules.get("levelsautocover")?.active)) {
          data.problems.push({
            moduleId: "levelsautocover",
            severity: "Error",
            problemSummary: "You must enable the 'levelsautocover' module to use the 'Levels Auto Cover' option for 'Walls Block Range'",
            problemDetail: undefined,
            fixer: "Enable the 'levelsautocover' module"
          });
        }
        break;
      case "simbuls-cover-calculator":
        if (!(game.modules.get("simbuls-cover-calculator")?.active)) {
          data.problems.push({
            moduleId: "simbuls-cover-calculator",
            severity: "Error",
            problemSummary: "You must enable the 'simbuls-cover-calculator' module to use the 'Simbul's Cover Calculator' option for 'Walls Block Range'",
            problemDetail: undefined,
            fixer: "Enable the 'simbuls-cover-calculator' module"
          });
        }
        break;
      case "tokenvisibility":
        data.problems.push({
          moduleId: "tokenvisibility",
          severity: "Error",
          problemSummary: "Midi has swtiched to Alternate Token Cover from Alternate Token Visibility. You should install and activate Alternative Token Cover",
          problemDetail: undefined,
          fixer: "Enable the 'tokencover' module and set 'Walls Block Range' to 'Token Cover' on the Mechanics Tab"
        });
        break;
      case "tokencover":
        if (!(game.modules.get("tokencover")?.active)) {
          data.problems.push({
            moduleId: "tokencover",
            severity: "Error",
            problemSummary: "You must enable the 'tokencover' module to use the 'Token Cover' option for 'Walls Block Range'",
            problemDetail: undefined,
            fixer: "Enable the 'tokencover' module"
          });
        }
        break;
    }
    switch (configSettings.optionalRules.coverCalculation) {
      case "none":
        break;
      case "levelsautocover":
        if (!(game.modules.get("levelsautocover")?.active)) {
          data.problems.push({
            moduleId: "levelsautocover",
            severity: "Error",
            problemSummary: "You must enable the 'levelsautocover' module to use the 'Levels Auto Cover' option for 'Walls Block Range'",
            problemDetail: undefined,
            fixer: "Enable the 'levelsautocover' module"
          });
        }
        break;
      case "simbuls-cover-calculator":
        if (!(game.modules.get("simbuls-cover-calculator")?.active)) {
          data.problems.push({
            moduleId: "simbuls-cover-calculator",
            severity: "Error",
            problemSummary: "You must enable the 'simbuls-cover-calculator' module to use the 'Simbul's Cover Calculator' option for 'Walls Block Range'",
            problemDetail: undefined,
            fixer: "Enable the 'simbuls-cover-calculator' module"
          });
        }
        break;
      case "tokenvisibility":
        data.problems.push({
          moduleId: "tokenvisibility",
          severity: "Error",
          problemSummary: "Midi has swtiched to Alternate Token Cover from Alternate Token Visibility. You should install Alternative Token Cover",
          problemDetail: undefined,
          fixer: "Enable the 'tokencover' module and update 'Calculate Cover' to 'Token Cover' on the Mechanics tab"
        });
        break;
      case "tokencover":
        if (!(game.modules.get("tokencover")?.active)) {
          data.problems.push({
            moduleId: "tokencover",
            severity: "Error",
            problemSummary: "You must enable the 'tokencover' module to use the 'Token Cover' option for 'Walls Block Range'",
            problemDetail: undefined,
            fixer: "Enable the 'tokencover' module"
          });
        }
        break;
    }

    switch (configSettings.autoTarget) {
      case "dftemplates":
        if (!game.modules.get("df-templates")?.active) {
          data.problems.push({
            moduleId: "dftemplates",
            severity: "Error",
            problemSummary: "You must enable the 'dftemplates' module to use the 'DF Templates' option for 'Auto Target on Template Draw'",
            problemDetail: undefined,
            fixer: "Enable the 'dftemplates' module"
          });
        }
        break;
      case "walledtemplates":
        if (!game.modules.get("walledtemplates")?.active) {
          data.problems.push({
            moduleId: "walledtemplates",
            severity: "Error",
            problemSummary: "You must enable the 'walledtemplates' module to use the 'Walled Templates' option for 'Auto Target on Template Draw'",
            problemDetail: undefined,
            fixer: "Enable the 'walledtemplates' module"
          });
        }
        break;
    }
  }

  public static checkMidiSaveSettings(data: TroubleShooterData) {
    if (!installedModules.get("monks-tokenbar")
      && (configSettings.playerRollSaves === "mtb" || configSettings.rollNPCSaves === "mtb" || configSettings.rollNPCLinkedSaves === "mtb")) {
      data.problems.push({
        moduleId: "monks-tokenbar",
        severity: "Error",
        problemSummary: "You must enable the 'monks-tokenbar' module to use the 'Monk's Token Bar' option for 'Roll NPC.Player Saves'",
        problemDetail: undefined,
        fixer: "Enable the 'monks-tokenbar' module"
      });
    }
    if (!installedModules.get("lmrtfy") &&
      (configSettings.playerRollSaves === "lmrtfy" || configSettings.rollNPCSaves === "lmrtfy" || configSettings.rollNPCLinkedSaves === "lmrtfy")) {
      data.problems.push({
        moduleId: "lmrtfy",
        severity: "Error",
        problemSummary: "You must enable the 'lmrtfy' module to use the 'LMRTFY' option for Rolling NPC/Player saves",
        problemDetail: undefined,
        fixer: "Enable the 'lmrtfy' module"
      });
    }
  }
  public static checkWalledTemplates(data: TroubleShooterData) {
    if (game.modules.get("walledtemplates")?.active) {
      const walledTemplatesTargeting = safeGetGameSetting("walledtemplates", "autotarget-menu") === 'yes' || (safeGetGameSetting("walledtemplates", "autotarget-menu") === 'toggle' && safeGetGameSetting("walledtemplates", "autotarget-enabled"));
      // const walledTemplatesTargeting = safeGetGameSetting("walledtemplates", "autotarget-enabled");
      const midiTargeting = configSettings.autoTarget !== "walledtemplates" && configSettings.autoTarget !== "none";

      if (walledTemplatesTargeting && midiTargeting) {
        data.problems.push({
          moduleId: "walledtemplates",
          severity: "Error",
          problemSummary: "Both walled templates auto targeting and midi's auto targeting are enabled",
          problemDetail: undefined,
          fixer: "Only enable one of the auto targeting options",
          /*          fixerFunc: async function (app: TroubleShooter) {
                      if (!game.user?.isGM) {
                        ui.notifications?.error("midi-qol | You must be a GM to fix walled templates auto target");
                        return;
                      }
                      await game.settings.set("walledtemplates", "autotarget-enabled", true);
                      await game.settings.set("walledtemplates", "autotarget-menu", "yes");
                      configSettings.autoTarget = "walledtemplates";
                      await game.settings.set("midi-qol", "ConfigSettings", configSettings);
                      //@ts-expect-error reload configure
                      SettingsConfig.reloadConfirm({ world: true });
                      TroubleShooter.data = TroubleShooter.collectTroubleShooterData();
                      app.render(true)
                    },
          */
          fixerId: -1
        });
      } else if (walledTemplatesTargeting && configSettings.autoTarget !== "walledtemplates") {
        data.problems.push({
          moduleId: "walledtemplates",
          severity: "Error",
          problemSummary: "Walled templates is set to auto target and midi is not using it for targeting",
          problemDetail: undefined,
          fixer: "Disable walled templates auto target",
          fixerFunc: async function (app: TroubleShooter) {
            if (!game.user?.isGM) {
              ui.notifications?.error("midi-qol | You must be a GM to fix walled templates settings");
              return;
            }
            // @ts-expect-error
            await game.settings.set("walledtemplates", "autotarget-enabled", false);
            // @ts-expect-error
            await game.settings.set("walledtemplates", "autotarget-menu", "no");
            TroubleShooter.data = TroubleShooter.collectTroubleShooterData();
            app.render(true)
          },
          fixerId: -1
        });
      }
    } else if (configSettings.autoTarget === "walledtemplates") {
      data.problems.push({
        moduleId: "walledtemplates",
        severity: "Error",
        problemSummary: "Midi is set to use walled templates but the module is not enabled",
        problemDetail: undefined,
        fixer: "Enable the walled templates module",
        fixerId: -1
      });
    }
  }

  public static checkItemMacro(data: TroubleShooterData) {
    if (!game.modules.get("itemacro")?.active) return;
    if (safeGetGameSetting('itemacro', 'charsheet')) {
      data.problems.push({
        moduleId: "itemacro",
        severity: "Warn",
        problemSummary: "Item Macro Character sheet hook is enabled.",
        problemDetail: undefined,
        fixer: "Turn off the setting in module settings or use the auto fix button",
        fixerFunc: async function (app: TroubleShooter) {
          if (!game.user?.isGM) {
            ui.notifications?.error("midi-qol | You must be a GM to fix Item Macro char sheet flag");
            return;
          }
          // @ts-expect-error
          await game.settings.set("itemacro", "charsheet", false);
          //@ts-expect-error
          SettingsConfig.reloadConfirm({ world: true });
        },
        fixerId: -1
      });
    }
  }

  public static checkCommonProblems(data: TroubleShooterData) {
    this.checkMidiSettings(data);
    this.checkMidiCoverSettings(data)
    this.checkMidiSaveSettings(data);
    this.checkNoActorTokens(data);
    this.checkConcentrationStatusEffects(data);
  }

  public static checkAutoAnimations(data: TroubleShooterData) {
  }

  // public static checkWarpgateUserPermissions(data: TroubleShooterData) {
  //   if (!game.permissions?.TOKEN_CREATE.includes(1)) {
  //     const problem: ProblemSpec = {
  //       moduleId: "warpgate",
  //       severity: "Warn",
  //       problemSummary: "Players Do not have permission to create tokens",
  //       problemDetail: undefined,
  //       fixer: "Edit player permissions"
  //     }
  //     data.problems.push(problem);
  //   }

  //   if (!game.permissions?.TOKEN_CONFIGURE.includes(1)) {
  //     const problem: ProblemSpec = {
  //       moduleId: "warpgate",
  //       severity: "Warn",
  //       problemSummary: "Players Do not have permission to configure tokens",
  //       problemDetail: undefined,
  //       fixer: "Edit player permissions"
  //     }
  //     data.problems.push(problem);
  //   }

  //   if (!game.permissions?.FILES_BROWSE.includes(1)) {
  //     const problem: ProblemSpec = {
  //       moduleId: "warpgate",
  //       severity: "Warn",
  //       problemSummary: "Players Do not have permission to browse files",
  //       problemDetail: undefined,
  //       fixer: "Edit player permissions"
  //     }
  //     data.problems.push(problem);
  //   }
  // }

  // Check for tokens with no actors
  public static checkNoActorTokens(data: TroubleShooterData) {
    const problemTokens = canvas.tokens?.placeables.filter(token => !token.actor);
    if (problemTokens?.length) {
      let problem: ProblemSpec = {
        moduleId: "midi-qol",
        severity: "Warn",
        problemSummary: "There are tokens with no actor in the scene",
        problemDetail: problemTokens.map(t => {
          const detail = {};
          detail[`${t.scene?.name ?? ""} - ${t.name}`] = t.document.uuid;
          return detail;
        }),
        fixer: "You should edit or remove them"
      }
      data.problems.push(problem);
    }
  }

  public static checkMidiSettings(data: TroubleShooterData) {
    if (!(safeGetGameSetting("midi-qol", "EnableWorkflow"))) {
      data.problems.push({
        moduleId: "midi-qol",
        severity: "Warn",
        problemSummary: "Combat automation is disabled",
        problemDetail: "Also need to check on all player clients",
        fixerFunc: async function (app: TroubleShooter) {
          game.settings.set("midi-qol", "EnableWorkflow", true).then(() => {
            fetchParams();
            TroubleShooter.data = TroubleShooter.collectTroubleShooterData();
            app.render({ force: true })
          });
        },
        fixerId: -1
      });
    }
  }
}

interface ProblemSpec {
  moduleId: string | undefined,
  severity: "Error" | "Warn" | "Inform",
  problemSummary: string,
  critical?: boolean,
  problemDetail: any | undefined,
  fixer?: string,
  fixerFunc?: any,
  fixerId?: number;
}
interface TroubleShooterData {
  midiVersion: string;
  isLocal: boolean;
  fileName: string;
  summary: any,
  problems: ProblemSpec[],
  modules: any
  errors: any,
  midiSettings: any
}


function removeIpAddressAndHostName(inputString) {
  // Regular expression to match URLs
  const urlRegex = /(?:https?|ftp):\/\/([a-zA-Z0-9.-]+)(?::\d+)?(\/[^\s]*)?/gi;

  // Replace each matched URL with a sanitised version
  const sanitisedString = inputString.replace(urlRegex, (match, hostname) => {
    return match.replaceAll(hostname, "<address>")
  });

  return sanitisedString;
}