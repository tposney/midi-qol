import { criticalDamage, criticalDamageChoices, nsaFlag, coloredBorders, coloredBordersOptions, importSettingsFromJSON, exportSettingsToJSON, enableWorkflow, wallsBlockRangeOptionsNew, coverCalculationOptions, hiddenAdvantageOptions, addDeadOptions, rollNPCSavesOptions, playerRollSavesOptions, autoCheckHitOptions, autoTargetOptions, rangeTargetOptions, requiresTargetsOptions, autoCheckSavesOptions, autoRollDamageOptions, removeButtonsOptions, autoApplyDamageOptions, damageCardStyleOptions, playerDamageCardOptions, damageImmunitiesOptions, showItemDetailsOptions, doReactionsOptions, gmDoReactionsOptions, autoCEEffectsOptions, rollOtherDamageOptions, showReactionAttackRollOptions, recordAOOOptions, EnforceReactionsOptions, autoEffectsOptions, requireMagicalOptions, hideRollDetailsOptions, checkFlankingOptions, playerRollSavesOptionsReduced, rollAlternateOptions, consumeResourceOptions, averageDamageOptions, removeConcentrationEffectsOptions, incapacitatedOptions, checkRangeOptions, invisAdvantageOptions, confirmAttackDamageOptions, challengeModeArmorOptions, saveDROrderOptions, doConcentrationCheckOptions, addChatDamageButtonsOptions, activationAutomationOptions, safeGetGameSetting, resetConfigSettingsToDefaults, distanceMeasurementOptions } from "../settings.js"
import { configSettings } from "../settings.js"
import { warn, i18n, error, debug, debugEnabled, log, GameSystemConfig, ceInterface } from "../../midi-qol.js";
import { installedModules } from "../setupModules.js";
import type { SelectOptions } from "../../globals.js";
import { withOptionLabel } from "../lib/HandlebarsHelpers.js";
const { ApplicationV2, DialogV2, HandlebarsApplicationMixin } = foundry.applications.api;

const PATH = "./modules/midi-qol/sample-config/";

export class ConfigPanel extends HandlebarsApplicationMixin(ApplicationV2) {
  configHookId: number | undefined;
  activeTab: string;

  constructor(options?) {
    super(options);
    this.configHookId = Hooks.on("midi-qol.ConfigSettingsChanged", () => {
      this.close();
    });
    this.activeTab = "gm";
    return this;
  }

  static override DEFAULT_OPTIONS = {
    id: "midi-qol-settings",
    tag: "form",
    window: {
      title: "midi-qol.ConfigTitle",
      contentClasses: ["standard-form"]
    },
    position: {
      width: 800,
      height: "auto" as "auto"
    },
    form: {
      closeOnSubmit: true,
      handler: this.#onSubmit as any
    }
  };

  static override PARTS = {
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    gm: { template: "modules/midi-qol/templates/apps/ConfigPanel/gm.hbs" },
    player: { template: "modules/midi-qol/templates/apps/ConfigPanel/player.hbs" },
    workflow: { template: "modules/midi-qol/templates/apps/ConfigPanel/workflow.hbs" },
    concentration: { template: "modules/midi-qol/templates/apps/ConfigPanel/concentration.hbs" },
    reactions: { template: "modules/midi-qol/templates/apps/ConfigPanel/reactions.hbs" },
    misc: { template: "modules/midi-qol/templates/apps/ConfigPanel/misc.hbs" },
    mechanics: { template: "modules/midi-qol/templates/apps/ConfigPanel/mechanics.hbs" },
    rules: { template: "modules/midi-qol/templates/apps/ConfigPanel/rules.hbs" },
    quick: { template: "modules/midi-qol/templates/apps/ConfigPanel/quick.hbs" },
    footer: { template: "modules/midi-qol/templates/apps/ConfigPanel/footer.hbs" }
  }

  // V13 version:
  static TABS = {
    sheet: {
      tabs: [
        {id: "gm"},
        {id: "player"},
        {id: "workflow"},
        {id: "concentration"},
        {id: "reactions"},
        {id: "misc"},
        {id: "mechanics"},
        {id: "rules"},
        {id: "quick"},
      ],
      initial: "gm",
      labelPrefix: "midi-qol.Config.Tabs"
    }
  // This is silly, but for now there's some types-thinks "mandatory" fields 
  } as unknown as Record<string, foundry.applications.api.ApplicationV2.TabsConfiguration>

  // V12 version:
  // tabGroups = {
  //   sheet: "gm"
  // }

  get title() {
    return i18n("midi-qol.ConfigTitle") ?? "Midi-QOL Configuration";
  }

  async _prepareContext(options) {
    if (!enableWorkflow) {
      ui.notifications?.error("Workflow automation is not enabled")
    }
    let wallsBlockRangeOptions: SelectOptions = foundry.utils.duplicate(wallsBlockRangeOptionsNew);
    let CoverCalculationOptions: SelectOptions = foundry.utils.duplicate(coverCalculationOptions);
    [{ id: "levelsautocover", name: "'Levels Auto Cover'" }, { id: "simbuls-cover-calculator", name: "'Simbuls Cover Calculator'" }, { id: "simplecover5e", name: "'Simple Cover 5e'" }, { id: "tokencover", name: "'Alternative Token Cover'" }].forEach(module => {
      if (!installedModules.get(module.id)) {
        const notInstalled = game.i18n?.format("MODMANAGE.DepNotInstalled", { missing: "" }) ?? "";
        wallsBlockRangeOptions[module.id] = withOptionLabel(wallsBlockRangeOptions[module.id], `${i18n(wallsBlockRangeOptions[module.id])} - ${notInstalled}`);
        CoverCalculationOptions[module.id] = withOptionLabel(CoverCalculationOptions[module.id], `${i18n(CoverCalculationOptions[module.id])} - ${notInstalled}`);
      }
    });
    if (!installedModules.get("levels")) {
      wallsBlockRangeOptions["centerLevels"] = withOptionLabel(wallsBlockRangeOptions["centerLevels"], `${i18n(wallsBlockRangeOptions["centerLevels"])} - ${game.i18n?.format("MODMANAGE.DepNotInstalled", { missing: "Levels" })}`);
    }
    let HiddenAdvantageOptions: SelectOptions = foundry.utils.duplicate(hiddenAdvantageOptions);
    [{ id: "perceptive", name: "Perceptive" }].forEach(module => {
      if (!installedModules.get(module.id)) {
        HiddenAdvantageOptions[module.id] = withOptionLabel(HiddenAdvantageOptions[module.id], `${i18n(HiddenAdvantageOptions[module.id])} - ${game.i18n?.format("MODMANAGE.DepNotInstalled", { missing: "" })}`);
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
    const AddWoundedOptions = foundry.utils.duplicate(addDeadOptions);
    delete AddWoundedOptions["none"];
    const rollNPCSavesOptionsLocalized: SelectOptions = foundry.utils.duplicate(rollNPCSavesOptions);
    for (let key of Object.keys(rollNPCSavesOptions)) {
      const notInstalled = game.i18n?.format("MODMANAGE.DepNotInstalled", { missing: "" }) ?? "";
      switch (key) {
        case "mtb":
          if (!installedModules.get("monks-tokenbar")) rollNPCSavesOptionsLocalized[key] = withOptionLabel(rollNPCSavesOptions[key], `${i18n(rollNPCSavesOptions[key])} - ${notInstalled}`);
          break;
        case "ftb":
          if (!installedModules.get("flash-rolls-5e")) rollNPCSavesOptionsLocalized[key] = withOptionLabel(rollNPCSavesOptions[key], `${i18n(rollNPCSavesOptions[key])} - ${notInstalled}`);
          break;
        case "rer":
          if (!installedModules.get("epic-rolls-5e")) rollNPCSavesOptionsLocalized[key] = withOptionLabel(rollNPCSavesOptions[key], `${i18n(rollNPCSavesOptions[key])} - ${notInstalled}`);
      }

    }
    let playerRollSavesOptionsLocalized: SelectOptions = foundry.utils.duplicate(playerRollSavesOptions);
    for (let key of Object.keys(playerRollSavesOptions)) {
      const notInstalled = game.i18n?.format("MODMANAGE.DepNotInstalled", { missing: "" }) ?? "";
      switch (key) {
        case "mtb":
          if (!installedModules.get("monks-tokenbar")) playerRollSavesOptionsLocalized[key] = withOptionLabel(playerRollSavesOptionsLocalized[key], `${i18n(playerRollSavesOptionsLocalized[key])} - ${notInstalled}`);
          break;
        case "ftb":
          if (!installedModules.get("flash-rolls-5e")) playerRollSavesOptionsLocalized[key] = withOptionLabel(playerRollSavesOptionsLocalized[key], `${i18n(playerRollSavesOptionsLocalized[key])} - ${notInstalled}`);
          break;
        case "rer":
          if (!installedModules.get("epic-rolls-5e")) playerRollSavesOptionsLocalized[key] = withOptionLabel(playerRollSavesOptionsLocalized[key], `${i18n(playerRollSavesOptionsLocalized[key])} - ${notInstalled}`);
      }
    };

    let statusEffectList = CONFIG.statusEffects.map((se) => {
      let name = i18n(se.name);
      if (se.id.startsWith("Convenient Effect")) name = `${name} (CE)`;
      return { id: se.id, name: name }
    });

    if (ceInterface) {
      statusEffectList = statusEffectList.concat(ceInterface.findEffects().map(ae => ({ id: `z${ae.flags["dfreds-convenient-effects"].ceEffectId}`, name: `${ae.name} (CE)` })));
    }
    let StatusEffectOptions = statusEffectList.reduce((acc, { id, name }) => { acc[id] = name; return acc }, { "none": "None" });
    const vitalityDeathRequiresOptions = {
      "vitalityOnly": "midi-qol.VitalityDeathRequires.VitalityOnly",
      "vitalityAndHP": "midi-qol.VitalityDeathRequires.VitalityAndHP"
    };
    let context: any = {
      configSettings,
      quickSettings: true,
      quickSettingsOptions,
      autoCheckHitOptions,
      autoTargetOptions,
      rangeTargetOptions,
      requiresTargetsOptions,
      autoCheckSavesOptions,
      autoRollDamageOptions,
      removeButtonsOptions,
      criticalDamage,
      criticalDamageChoices,
      autoApplyDamageOptions,
      damageCardStyleOptions,
      playerDamageCardOptions,
      damageImmunitiesOptions,
      showItemDetailsOptions,
      doReactionsOptions,
      wallsBlockRangeOptions,
      gmDoReactionsOptions,
      AutoCEEffectsOptions: autoCEEffectsOptions,
      rollOtherDamageOptions,
      showReactionAttackRollOptions,
      CoverCalculationOptions,
      distanceMeasurementOptions,
      RecordAOOOptions: recordAOOOptions,
      EnforceReactionsOptions: EnforceReactionsOptions,
      AutoEffectsOptions: autoEffectsOptions,
      RequireMagicalOptions: requireMagicalOptions,
      itemTypeLabels: Object.keys(CONFIG.Item.typeLabels).filter(key => !["backpack", "base"].includes(key)).reduce((acc, key) => { acc[key] = CONFIG.Item.typeLabels[key]; return acc }, {}),
      hasConvenientEffects: installedModules.get("dfreds-convenient-effects"),
      hideRollDetailsOptions,
      checkFlankingOptions,
      nsaFlag,
      coloredBorders,
      coloredBordersOptions,
      playerRollSavesOptions: playerRollSavesOptionsLocalized,
      rollNPCSavesOptions: rollNPCSavesOptionsLocalized,
      customSoundsPlaylistOptions: game.playlists?.contents.reduce((acc, e) => { acc[e.id] = e.name; return acc }, {}) || {},
      customSoundOptions: game.playlists?.get(configSettings.customSoundsPlaylist)?.sounds.reduce((acc, s) => { acc[s.id ?? ""] = s.name; return acc }, { "none": "" }),
      rollSoundOptions: CONFIG.sounds,
      isBetterRolls: installedModules.get("betterrolls5e"),
      rollAlternateOptions,
      ConsumeResourceOptions: consumeResourceOptions,
      AddDeadOptions: addDeadOptions,
      AddWoundedOptions,
      AverageDamageOptions: averageDamageOptions,
      RemoveConcentrationEffectsOptions: removeConcentrationEffectsOptions,
      IncapacitatedOptions: incapacitatedOptions,
      CheckRangeOptions: checkRangeOptions,
      InvisAdvantageOptions: invisAdvantageOptions,
      HiddenAdvantageOptions,
      ConfirmAttackDamageOptions: confirmAttackDamageOptions,
      ChallengeModeArmorOptions: challengeModeArmorOptions,
      RollSkillsBlindOptions: foundry.utils.mergeObject({ "all": "All" }, Object.keys(GameSystemConfig.skills).reduce((acc, s) => { acc[s] = GameSystemConfig.skills[s].label; return acc }, {})),
      RollSavesBlindOptions: foundry.utils.mergeObject({ "all": "All", "death": i18n("DND5E.DeathSave") }, Object.keys(GameSystemConfig.abilities).reduce((acc, s) => { acc[s] = GameSystemConfig.abilities[s].label; return acc }, {})),
      RollChecksBlindOptions: foundry.utils.mergeObject({ "all": "All" }, Object.keys(GameSystemConfig.abilities).reduce((acc, s) => { acc[s] = GameSystemConfig.abilities[s].label; return acc }, {})),
      midiPropertiesTabOptions: CONST.USER_ROLE_NAMES,
      StatusEffectOptions,
      vitalityDeathRequiresOptions,
      SaveDROrderOptions: saveDROrderOptions,
      ColorOptions: colorList.reduce((acc, c) => { acc[c] = c; return acc }, { "Delete": "Delete" }),
      DoConcentrationCheckOptions: doConcentrationCheckOptions,
      AddChatDamageButtonsOptions: addChatDamageButtonsOptions,
      ActivationAutomationOptions: activationAutomationOptions,
      rollModes: CONFIG.Dice.rollModes,
      fastForwardOptions: {
        attack: i18n("midi-qol.fastForwardOptions.attack"),
        damage: i18n("midi-qol.fastForwardOptions.damage"),
        check: i18n("midi-qol.fastForwardOptions.check"),
        save: i18n("midi-qol.fastForwardOptions.save"),
        skill: i18n("midi-qol.fastForwardOptions.skill"),
        tool: i18n("midi-qol.fastForwardOptions.tool"),
      },
      preferredGMOptions: game.users?.filter(user => user.isGM).reduce((acc, user) => {
        acc[user.id] = user.name ?? "";
        return acc;
      }, { "": i18n("None") } as Record<string, string>),
    };
    context = foundry.utils.mergeObject(await super._prepareContext(options), context, { inplace: false });
    context.concentrationDisabled =safeGetGameSetting("dnd5e", "disableConcentration");
    const attackRollVisibility = safeGetGameSetting("dnd5e", "attackRollVisibility") as string;
    if (attackRollVisibility !== undefined) {
      const choices = game.settings.settings.get("dnd5e.attackRollVisibility")?.choices;
      context.attackRollVisibilityOptions = choices;
      context.attackRollVisibilityValue = attackRollVisibility;
    }
    const challengeVisibility = safeGetGameSetting("dnd5e", "challengeVisibility") as string;
    if (challengeVisibility !== undefined) {
      const choices = game.settings.settings.get("dnd5e.challengeVisibility")?.choices;
      context.challengeVisibilityOptions = choices;
      context.challengeVisibilityValue = challengeVisibility;
    }
    // context.tabs = this.#getTabs();
    if (debugEnabled > 0) warn("Config Panel: getData ", context)
    return context;
  }

  changeTab(tab, group, options?) {
    super.changeTab(tab, group, options);
    this.activeTab = tab;
  }

  // V12-only (I think): does not seem to be
  async _preparePartContext(partId, context) {
    // @ts-expect-error shhh
    const partContext = await super._preparePartContext(partId, context);
    // @ts-expect-error it's okay
    if (partId in (partContext.tabs ?? {})) partContext.tab = partContext.tabs[partId];
    // if (Object.keys(context.tabs).includes(partId)) {
    //   context.tab = context.tabs[partId];
    // }
    return partContext;
  }

  _onSearch(term) {
    for (let tag of [".midi-qol-box", ".form-group"]) {
      const elts = Array.from(this.element.querySelectorAll(tag));
      term = term.toLowerCase().trim();
      elts.forEach((el) => {
        // @ts-expect-error
        if (!term || el.innerText.toLowerCase().includes(term)) {
          // @ts-expect-error
          el.style.display = null;
        } else {
          // @ts-expect-error
          el.style.display = "none";
        }
      });
    }
  }

  async _onRender(context, options) {
    super._onRender(context, options);
    // Don't think this was doing anything
    // html.find(".playlist").change(this._playList.bind(this));
    this.element.querySelector(".itemTypeListEdit")?.addEventListener("click", event => {
      const options = Object.entries(CONFIG.Item.typeLabels).filter(kv => !["backpack", "base"].includes(kv[0])).map(([k, v]) => ({ value: k, label: i18n(v), selected: configSettings.itemTypeList?.includes(k) }));
      options.sort((a, b) => a.label.compare(b.label));
      DialogV2.prompt<foundry.applications.api.DialogV2.PromptConfig>({
        id: "midi-qol-item-selector",
        content: foundry.applications.fields.createMultiSelectInput({
          type: "checkboxes",
          name: "items",
          options
        }).outerHTML,
        window: { title: "Show Item Details" },
        position: {
          height: "auto"
        },
        ok: {
          label: "DND5E.TraitSave",
          icon: "fa-solid fa-floppy-disk",
          callback: (evt, button) => {
            const data = new foundry.applications.ux.FormDataExtended(button.form as HTMLFormElement);
            // @ts-expect-error
            if (data) configSettings.itemTypeList = data.object?.items ?? configSettings.itemTypeList;
          }
        },
        rejectClose: false
      });
    });
    this.element.querySelector(".optionalRulesEnabled")?.addEventListener("click", event => {
      configSettings.optionalRulesEnabled = !configSettings.optionalRulesEnabled;
      this.render({ force: true });
    });
    this.element.querySelector("#midi-qol-export-config")?.addEventListener("click", exportSettingsToJSON);
    this.element.querySelector("#midi-qol-import-config")?.addEventListener("click", async () => {
      if (await importFromJSONDialog()) this.close();
    });
    for (const elem of Array.from(this.element.querySelectorAll(".midi-qol-blind-select"))) {
      elem.addEventListener("mouseenter", this.selectHover.bind(this));
      elem.addEventListener("mouseleave", this.selectHoverOut.bind(this));
    }
    for (const elem of Array.from(this.element.querySelectorAll(".import-quick-setting"))) {
      elem.addEventListener("click", async function (event) {
        const key = event.currentTarget?.id;
        if (await applySettings.bind(this)(key)) this.close();
      }.bind(this));
    }
    // @ts-expect-error
    this.element.querySelector('input[type="search"]')?.addEventListener("input", (e) => { this._onSearch(e.currentTarget?.value) });
  }

  selectHover(event) {
    const target = event.currentTarget;
    target.focus();
  }
  selectHoverOut(event) {
    const target = event.currentTarget;
    target.blur();
  }

  async _preClose(options) {
    await super._preClose(options);
    if (this.configHookId) Hooks.off("midi-qol.ConfigSettingsChanged", this.configHookId);
  }

  // async _playList(event) {
  //   event.preventDefault();
  //   configSettings.customSoundsPlaylist = `${$(event.currentTarget).children("option:selected").val()}`;
  //   await this.submit({ preventClose: true });
  //   this.render();
  // }

  // onReset() {
  //   this.render(true);
  // }

  static async #onSubmit(event, form, formData) {
    const realData = formData.object;
    let needReload = false;
    realData.itemTypeList = configSettings.itemTypeList;
    if (realData.enforceReactions !== "none" && configSettings.enforceReactions !== realData.enforceReactions) {
      needReload = true;
    }
    if (realData.enforceBonusActions !== "none" && configSettings.enforceBonusActions !== realData.enforceBonusActions) {
      needReload = true;
    }
    if (configSettings.activityNamePrefix !== realData.activityNamePrefix) needReload = true;

    // Handle dnd5e attackRollVisibility setting separately
    if (realData.dnd5eAttackRollVisibility !== undefined) {
      await game.settings.set("dnd5e", "attackRollVisibility", realData.dnd5eAttackRollVisibility);
      delete realData.dnd5eAttackRollVisibility;
    }

    // Handle dnd5e challengeVisibility setting separately
    if (realData.dnd5eChallengeVisibility !== undefined) {
      await game.settings.set("dnd5e", "challengeVisibility", realData.dnd5eChallengeVisibility);
      delete realData.dnd5eChallengeVisibility;
    }

    let newSettings = foundry.utils.mergeObject(configSettings, realData, { overwrite: true, inplace: false });
    if (game.user?.can("SETTINGS_MODIFY")) {
      game.settings.set("midi-qol", "ConfigSettings", newSettings);
      //@ts-expect-error v13 stubby
      if (needReload) foundry.applications.settings.SettingsConfig.reloadConfirm({world: true});
    }
  }
}

async function importFromJSONDialog() {
  const content = await foundry.applications.handlebars.renderTemplate("templates/apps/import-data.hbs", { entity: "midi-qol", name: "settings" });
  let dialog = new Promise((resolve, reject) => {
    new DialogV2({
      window: { title: `Import midi-qol settings` },
      position: {
        width: 400,
        height: "auto"
      },
      content: content,
      buttons: [
        {
          action: "import",
          icon: "fa-solid fa-file-import",
          label: 'Import',
          default: true,
          callback: event => {
            const form = (event.currentTarget as HTMLElement | null)?.querySelector("form");
            if (!form?.data.files.length) return ui.notifications?.error("You did not upload a data file!");
            foundry.utils.readTextFromFile(form.data.files[0]).then(json => {
              importSettingsFromJSON(json).then(() => resolve(true))
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
    }).render({ force: true });
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
    if (title !== "") dialogTitle = `${i18n("midi-qol.Config.Tabs.quick")} - ${title}`;
    else dialogTitle = i18n("midi-qol.Config.Tabs.quick");
    let d = new DialogV2({
      classes: ["midi-qol-quick-config"],
      window: { title: dialogTitle },
      position: {
        height: "auto"
      },
      content: changes.join("<br>"),
      buttons: [
        {
          action: "apply",
          default: true,
          icon: "fa-solid fa-check",
          label: 'Apply',
          callback: () => resolve(true)
        },
        {
          action: "abort",
          icon: "fa-solid fa-xmark",
          label: 'Don\'t Apply',
          callback: () => resolve(false)
        }
      ],
    }).render({ force: true });
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
      gmAutoFastForward: ["attack", "damage"],
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
      gmAutoFastForward: [],
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
      autoFastForward: ["attack", "damage"],
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
      autoFastForward: [],
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
      game.settings.set(game.system?.id, "disableConcentration", false);
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
      game.settings.set("midi-qol", "AddChatDamageButtons", "gm");
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
      game.settings.set(game.system?.id, "disableConcentration", true);
    }
  },

  SecretSquirrel: {
    description: "Secret Squirrel: Hide most GM roll info from players",
    shortDescription: "Secret Squirrel",
    configSettings: {
      hideRollDetails: "all",
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
      if (!installedModules.get("anonymous")) ui.notifications?.warn("'Anonymous' is recommended to hide creature names for normal dnd5e rolls");
      game.settings.set("dnd5e", "challengeVisibility", "none");
    }
  },
  FullDisclosure: {
    description: "Full Disclosure: Players see the details of all GM rolls and the results",
    shortDescription: "Full Disclosure",
    configSettings: {
      hideRollDetails: "none",
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
      game.settings.set("dnd5e", "challengeVisibility", "all");
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
      if (game.user?.can("SETTINGS_MODIFY")) game.settings.set("midi-qol", "ConfigSettings", settingsToApply);
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