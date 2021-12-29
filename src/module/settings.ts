import { MacroData } from "@league-of-foundry-developers/foundry-vtt-types/src/foundry/common/data/data.mjs";
import { _mergeUpdate } from "@league-of-foundry-developers/foundry-vtt-types/src/foundry/common/utils/helpers.mjs";
import { config } from "simple-peer";
import { debug, setDebugLevel, warn, i18n, checkConcentrationSettings, debugEnabled, geti18nTranslations } from "../midi-qol.js";
import { ConfigPanel} from "./apps/ConfigPanel.js"
import { configureDamageRollDialog } from "./patching.js";
import { isAutoFastAttack, reportMidiCriticalFlags } from "./utils.js";

export var itemRollButtons: boolean;
export var criticalDamage: string;
export var itemDeleteCheck: boolean;
export var nsaFlag: boolean;
export var coloredBorders: string;
export var saveRequests = {};
export var saveTimeouts = {};
export var addChatDamageButtons: string;
export var autoFastForwardAbilityRolls: boolean;
export var autoRemoveTargets: string;
export var forceHideRoll: boolean;
export var enableWorkflow: boolean;
export var dragDropTargeting: boolean;
export var useMidiCrit: boolean = true;

const defaultKeyMapping = {
  "DND5E.Advantage": "altKey", 
  "DND5E.Disadvantage": "ctrlKey", 
  "DND5E.Critical": "altKey",
  "DND5E.Versatile": "shiftKey"
};

class ConfigSettings {
  gmAutoAttack: boolean = false;
  gmAutoFastForwardAttack: boolean = false;
  gmLateTargeting: boolean = false;
  lateTargeting: boolean = false;
  gmAutoDamage: string = "none";
  gmAutoFastForwardDamage: boolean =  false;
  gmConsumeResource = false;
  gmHide3dDice: boolean = false;
  ghostRolls: boolean = false;
  speedItemRolls: boolean = false;
  speedAbilityRolls: boolean = false;
  showItemDetails: string = "";
  itemTypeList: any = null;
  autoRollAttack: boolean = false;
  autoFastForward: string = "off";
  consumeResource: boolean = false;
  autoTarget: string = "none";
  autoCheckHit: string = "none";
  autoCheckSaves: string = "none";
  hideRollDetails: string = "none";
  displaySaveDC: boolean = true;
  checkSaveText: boolean = false;
  defaultSaveMult: number = 0.5;
  autoRollDamage: string = "none";
  autoApplyDamage: string = "none";
  damageImmunities: string = "none";
  requireMagical: boolean = false;
  autoItemEffects: null;
  autoCEEffects: boolean = false;
  rangeTarget: string = "none";
  playerRollSaves: string = "none";
  playerSaveTimeout: number = 0;
  reactionTimeout: number = 10;
  gmDoReactions: string = "all";
  doReactions: string = "all";
  showReactionChatMessage: boolean = false;
  showReactionAttackRoll: string = "all";
  rollNPCSaves: string = "auto";
  rollNPCLinkedSaves: string = "auto";
  mergeCard: boolean = false;
  mergeCardCondensed: boolean = false;
  useTokenNames: boolean = false;
  requiresTargets: string = "none";
  fumbleSound: string = "";
  diceSound: string = "";
  criticalSound: string = "";
  itemUseSound: string = "";
  spellUseSound: string = "";
  weaponUseSound: string = "";
  potionUseSound: string = "";
  fullAuto: boolean = false;
  useCustomSounds: boolean = true;
  customSoundsPlaylist: string = "none";
  keyMapping = defaultKeyMapping;
  allowUseMacro: boolean = false;
  rollOtherDamage: string | boolean = "none";
  rollOtherSpellDamage: string | boolean = "none";
  removeButtons: string = "all";
  gmRemoveButtons: string = "all"; 
  concentrationAutomation: boolean = false;
  singleConcentrationRoll: boolean = true;
  removeConcentration: boolean = true;
  optionalRulesEnabled: boolean = false;
  itemRollStartWorkflow: boolean = false;
  usePlayerPortrait: boolean = false;
  promptDamageRoll: boolean = false;
  accelKeysOverride: boolean = false;
  effectActivation: boolean = false;
  enableddbGL: boolean = false;
  optionalRules: any = {
    invisAdvantage: true,
    checkRange: true,
    wallsBlockRange: "center",
    nearbyFoe: 5,
    nearbyAllyRanged: 4,
    incapacitated: true,
    removeHiddenInvis: true,
    maxDRValue: false,
    distanceIncludesHeight: false,
    criticalSaves: false,
    activeDefence: false,
    challengModeArmor: false
  };
  keepRollStats: boolean = false;
  saveStatsEvery: number = 20;
  playerStatsOnly: boolean = false;
}

export var configSettings = new ConfigSettings();

export function checkRule(rule: string) {
  return configSettings.optionalRulesEnabled && configSettings.optionalRules[rule];
}

export function collectSettingData() {
  let data = {
    configSettings,
    itemRollButtons,
    criticalDamage,
    itemDeleteCheck,
    nsaFlag,
    coloredBorders,
    addChatDamageButtons,
    autoFastForwardAbilityRolls,
    autoRemoveTargets,
    forceHideRoll,
    enableWorkflow,
    dragDropTargeting,
    flags: {}
  };
  data.flags["exportSource"] = {
    system: game.system.id,
    coreVersion: game.data.version,
    systemVersion: game.system.data.version
  };
  data.flags["modules"] = {
    abouttimeVersion: game.modules.get("about-time")?.data.version,
    betterRollsVersion: game.modules.get("betterrolls5e")?.data.version,
    cubVersion: game.modules.get("combat-utility-belt")?.data.version,
    condvisVersion: game.modules.get("conditional-visibility")?.data.version,
    daeVersion: game.modules.get("dae")?.data.version,
    DSNversion: game.modules.get("dice-so-nice")?.data.version,
    dndhelpersVersions: game.modules.get("dnd5e-helpers")?.data.version,
    itemMacroVersion: game.modules.get("itemacro")?.data.version,
    lmrtfyVersion: game.modules.get("lmrtfy")?.data.version,
    midiQolVerson: game.modules.get("midi-qol")?.data.version,
    monksVersion: game.modules.get("monks-tokenbar")?.data.version,
    socketlibVersion: game.modules.get("socketlib")?.data.version,
    simpleCalendarVersion: game.modules.get("foundryvtt-simple-calendar")?.data.version,
    timesUpVersion: game.modules.get("times-up")?.data.version
  };
  data.flags["all-modules"] = 
  //@ts-ignore
    (new Collection(game.modules).filter(m=>m.active)).map(m => {
      //@ts-ignore
      const mdata: any = duplicate(m.data);
      return {
        name: mdata.name,
        title: mdata.title,
        description: mdata.description,
        url: mdata.url,
        version: mdata.version,
        minimumCoreVersion: mdata.minimumCoreVersion,
        compatibleCoreVersion: mdata.compatibleCoreVersion,
        scripts: mdata.scripts,
        esmodules: mdata.esmodules,
        socket: mdata.socket

      }
    });
    return data;
}
export function exportSettingsToJSON() {
  const filename = `fvtt-midi-qol-settings.json`;
  saveDataToFile(JSON.stringify(collectSettingData(), null, 2), "text/json", filename);
}

export async function importSettingsFromJSON(json) {
  const data = JSON.parse(json);
  console.warn("midi-qol | Import settings ", data);
  game.settings.set("midi-qol", "ConfigSettings", data.configSettings);
  game.settings.set("midi-qol", "ItemRollButtons", data.itemRollButtons);
  game.settings.set("midi-qol", "CriticalDamage", data.criticalDamage);
  game.settings.set("midi-qol", "ItemDeleteCheck", data.itemDeleteCheck);
  game.settings.set("midi-qol", "showGM", data.nsaFlag);
  game.settings.set("midi-qol", "ColoredBorders", data.coloredBorders);
  game.settings.set("midi-qol", "AddChatDamageButtons", data.addChatDamageButtons);
  game.settings.set("midi-qol", "AutoFastForwardAbilityRolls", data.autoFastForwardAbilityRolls);
  game.settings.set("midi-qol", "AutoRemoveTargets", data.autoRemoveTargets);
  game.settings.set("midi-qol", "ForceHideRoll", data.forceHideRoll);
  game.settings.set("midi-qol", "EnableWorkflow", data.enableWorkflow);
  game.settings.set("midi-qol", "DragDropTarget", data.dragDropTargeting);
}

export let fetchParams = () => {
  if (debugEnabled > 1) debug("Fetch Params Loading");
  const promptDamageRoll = configSettings.promptDamageRoll ?? false;
  //@ts-ignore
  configSettings = game.settings.get("midi-qol", "ConfigSettings");
  if (!configSettings.fumbleSound) configSettings.fumbleSound = CONFIG.sounds["dice"];
  if (!configSettings.criticalSound) configSettings.criticalSound = CONFIG.sounds["dice"];
  if (!configSettings.diceSound) configSettings.diceSound = CONFIG.sounds["dice"];
  if (!configSettings.doReactions) configSettings.doReactions = "none";
  if (!configSettings.gmDoReactions) configSettings.gmDoReactions = "none";
  if (configSettings.reactionTimeout === undefined) configSettings.reactionTimeout = 0;
  if (typeof configSettings.rangeTarget !== "string") configSettings.rangeTarget = "none";
  if (!configSettings.showReactionAttackRoll === undefined) configSettings.showReactionAttackRoll = "all";
  // deal with change of type of rollOtherDamage
  if (configSettings.rollOtherDamage === false) configSettings.rollOtherDamage = "none";
  if (configSettings.rollOtherDamage === true) configSettings.rollOtherDamage = "ifSave";
  if (configSettings.rollOtherDamage === undefined) configSettings.rollOtherDamage = "none";
  if (!configSettings.rollOtherSpellDamage) configSettings.rollOtherSpellDamage = "none";
  if (configSettings.promptDamageRoll === undefined) configSettings.promptDamageRoll = false;
  if (configSettings.gmHide3dDice === undefined) configSettings.gmHide3dDice = false;
  if (configSettings.ghostRolls === undefined) configSettings.ghostRolls = false;
  if (configSettings.gmConsumeResource === undefined) configSettings.gmConsumeResource = false;
  if (configSettings.consumeResource === undefined) configSettings.consumeResource = false;
  if (configSettings.accelKeysOverride === undefined) configSettings.accelKeysOverride = false;
  if (!configSettings.enableddbGL) configSettings.enableddbGL = false;
  if (!configSettings.showReactionChatMessage) configSettings.showReactionChatMessage = false;
  if (!configSettings.gmLateTargeting) configSettings.gmLateTargeting = false; // TODO fix this
  if (!configSettings.lateTargeting) configSettings.lateTargeting = false; // TODO fix this

  if (!configSettings.keyMapping 
    || !configSettings.keyMapping["DND5E.Advantage"] 
    || !configSettings.keyMapping["DND5E.Disadvantage"]
    || !configSettings.keyMapping["DND5E.Critical"]) {
      configSettings.keyMapping = defaultKeyMapping;
  }

  if (typeof configSettings.requiresTargets !== "string") configSettings.requiresTargets = "none";
  if (!configSettings.optionalRules) {
    configSettings.optionalRules = {
      invisAdvantage: true,
      checkRange: true,
      wallsBlockRange: "center",
      nearbyFoe: 5,
      nearbyAllyRanged: 4,
      incapacitated: true,
      removeHiddenInvis: true,
      maxDRValue: false,
      distanceIncludesHeight: false,
      criticalSaves: false,
      activeDefence: false,
      challengeModeArmor: false,
      challengeModeArmorScale: false
    }
  }
  if (!configSettings.optionalRules.wallsBlockRange) configSettings.optionalRules.wallsBlockRange = "center";
  if (typeof configSettings.optionalRules.nearbyFoe !== "number") {
    if (configSettings.optionalRulesEnabled)
      configSettings.optionalRules.nearbyFoe = 5;
    else
      configSettings.optionalRules.nearbyFoe = 0;
  }
  configSettings.itemRollStartWorkflow = false;
  const itemList = Object.keys(CONFIG.Item.typeLabels);
  if (!configSettings.itemTypeList && itemList.length > 0) {
    configSettings.itemTypeList = itemList;
  }
  if (configSettings.defaultSaveMult === undefined) configSettings.defaultSaveMult = 0.5;

  enableWorkflow = Boolean(game.settings.get("midi-qol", "EnableWorkflow"));
  if (debugEnabled > 0) warn("Fetch Params Loading", configSettings);
  
  criticalDamage = String(game.settings.get("midi-qol", "CriticalDamage"));
  if (criticalDamage === "none") criticalDamage = "default";
  itemDeleteCheck = Boolean(game.settings.get("midi-qol", "ItemDeleteCheck"));
  nsaFlag = Boolean(game.settings.get("midi-qol", "showGM"));
  coloredBorders = String(game.settings.get("midi-qol", "ColoredBorders"));
  itemRollButtons = Boolean(game.settings.get("midi-qol", "ItemRollButtons"));
  addChatDamageButtons = String(game.settings.get("midi-qol", "AddChatDamageButtons"))
  autoFastForwardAbilityRolls = Boolean(game.settings.get("midi-qol", "AutoFastForwardAbilityRolls"));
  autoRemoveTargets = String(game.settings.get("midi-qol", "AutoRemoveTargets"));
  let debugText: string = String(game.settings.get("midi-qol", "Debug"));
  forceHideRoll = Boolean(game.settings.get("midi-qol", "ForceHideRoll"));
  dragDropTargeting = Boolean(game.settings.get("midi-qol", "DragDropTarget"));
  useMidiCrit = Boolean(game.settings.get("midi-qol", "UseMidiCrit"))

  if (game.ready) {
    configureDamageRollDialog();
  }

  setDebugLevel(debugText);
  if (configSettings.concentrationAutomation) {
    // Force on use macro to true
    if (!configSettings.allowUseMacro) {
      console.warn("Concentration requires On Use Macro to be enabled. Enabling")
      configSettings.allowUseMacro = true;
    }
    if (promptDamageRoll !== configSettings.promptDamageRoll) checkConcentrationSettings();
  }
}

const settings = [
  {
    name: "EnableWorkflow",
    scope: "client",
    default: true,
    config: true,
    type: Boolean,
    onChange: fetchParams
  },
  {
    name: "ItemRollButtons",
    scope: "world",
    default: true,
    type: Boolean,
    onChange: fetchParams
  },
  {
    name: "ItemDeleteCheck",
    scope: "client",
    default: true,
    type: Boolean,
    choices: [],
    config:true,
    onChange: fetchParams
  },
  {
    name: "showGM",
    scope: "world",
    default: false,
    type: Boolean,
    choices: [],
    onChange: fetchParams
  },
  {
    name: "ForceHideRoll",
    scope: "world",
    default: true,
    type: Boolean,
    choices: [],
    config:true,
    onChange: fetchParams
  },
  {
    name: "AutoFastForwardAbilityRolls",
    scope: "world",
    default: false,
    type: Boolean,
    config: true,
    onChange: fetchParams
  },
  {
    name: "DragDropTarget",
    scope: "world",
    default: false,
    type: Boolean,
    onChange: fetchParams,
    config: true
  },
  {
    name: "UseMidiCrit",
    scope: "world",
    default: true,
    type: Boolean,
    onChange: fetchParams,
    config: true
  },
  {
    name: "ConfigSettings",
    scope: "world",
    type: Object,
    default: configSettings,
    onChange: fetchParams,
    config: false
  }
];
export function registerSetupSettings() {
  const translations = geti18nTranslations();

  game.settings.register("midi-qol","CriticalDamage", {
    name: "midi-qol.CriticalDamage.Name",
    hint: "midi-qol.CriticalDamage.Hint",
    scope: "world",
    default: "default",
    type: String,
    config: true,
    choices: translations["CriticalDamageChoices"],
    onChange: fetchParams
  });
}
export const registerSettings = function() {
  const translations = geti18nTranslations();
  // Register any custom module settings here
  settings.forEach((setting, i) => {
    let MODULE = "midi-qol"
    let options = {
        name: game.i18n.localize(`${MODULE}.${setting.name}.Name`),
        hint: game.i18n.localize(`${MODULE}.${setting.name}.Hint`),
        scope: setting.scope,
        config: (setting.config === undefined) ? true : setting.config,
        default: setting.default,
        type: setting.type,
        onChange: setting.onChange
    };
    //@ts-ignore - too tedious to define undefined in each of the settings defs
    if (setting.choices) options.choices = setting.choices;
    game.settings.register("midi-qol", setting.name, options);
  });

  game.settings.register("midi-qol","CriticalDamage", {
    name: "midi-qol.CriticalDamage.Name",
    hint: "midi-qol.CriticalDamage.Hint",
    scope: "world",
    default: "none",
    type: String,
    config: true,
    choices: translations["CriticalDamageChoices"],
    onChange: fetchParams
  });

  game.settings.register("midi-qol","AddChatDamageButtons", {
    name: "midi-qol.AddChatDamageButtons.Name",
    hint: "midi-qol.AddChatDamageButtons.Hint",
    scope: "world",
    default: "none",
    type: String,
    config: true,
    choices: translations["AddChatDamageButtonsOptions"],
    onChange: fetchParams
  });

  game.settings.register("midi-qol", "ColoredBorders", 
  {
    name: "midi-qol.ColoredBorders.Name",
    hint: "midi-qol.ColoredBorders.Hint",
    scope: "world",
    default: "None",
    type: String,
    config: true,
    choices: translations["ColoredBordersOptions"],
    onChange: fetchParams
  });

  game.settings.register("midi-qol", "AutoRemoveTargets", {
    name: "midi-qol.AutoRemoveTargets.Name",
    hint: "midi-qol.AutoRemoveTargets.Hint",
    scope: "world",
    default: "dead",
    type: String,
    config: true,
    choices: translations["AutoRemoveTargetsOptions"],
    onChange: fetchParams
  });

  game.settings.registerMenu("midi-qol", "midi-qol", {
    name: i18n("midi-qol.config"),
    label: "midi-qol.WorkflowSettings",
    hint: i18n("midi-qol.Hint"),
    icon: "fas fa-dice-d20",
    type: ConfigPanel,
    restricted: true
  });

  if (isNewerVersion(game.data.version, "0.7.0")) {
    game.settings.register("midi-qol", "playerControlsInvisibleTokens", {
      name: game.i18n.localize("midi-qol.playerControlsInvisibleTokens.Name"),
      hint: game.i18n.localize("midi-qol.playerControlsInvisibleTokens.Hint"),
      scope: "world",
      default: false,
      config: true,
      type: Boolean,
      onChange: (value) => {window.location.reload()}
    });
  }

  game.settings.register("midi-qol", "Debug", {
    name: "midi-qol.Debug.Name",
    hint: "midi-qol.Debug.Hint",
    scope: "world",
    default: "None",
    type: String,
    config: true,
    choices: translations["DebugOptions"],
    onChange: fetchParams
  });

  game.settings.register("midi-qol", "notificationVersion", {
    name: "",
    hint: "",
    scope: "world",
    default: "0.0.0",
    type: String,
    config: false,
  });
}

