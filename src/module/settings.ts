import { debug, setDebugLevel, warn, i18n, checkConcentrationSettings, checkCubInstalled } from "../midi-qol";
import { ConfigPanel} from "./apps/ConfigPanel"

export var itemRollButtons: boolean;
export var criticalDamage: string;
export var itemDeleteCheck: boolean;
export var nsaFlag: boolean;
export var coloredBorders: string;
export var checkBetterRolls: boolean;
export var saveRequests = {};
export var saveTimeouts = {};
export var addChatDamageButtons: boolean;
export var autoFastForwardAbilityRolls: boolean;
export var autoRemoveTargets: string;
export var forceHideRoll: boolean;
export var enableWorkflow: boolean;
export var dragDropTargeting: boolean;

const defaultKeyMapping = {
  "DND5E.Advantage": "altKey", 
  "DND5E.Disadvantage": "ctrlKey", 
  "DND5E.Critical": "altKey",
  "DND5E.Versatile": "shiftKey"
};

export var configSettings = {
  gmAutoAttack: false,
  gmAutoFastForwardAttack: false,
  gmAutoDamage: "none",
  gmAutoFastForwardDamage: false,
  speedItemRolls: false,
  speedAbilityRolls: false,
  showItemDetails: "",
  itemTypeList: null,
  autoRollAttack: false,
  autoFastForward: "off",
  autoTarget: "none",
  autoCheckHit: "none",
  autoCheckSaves: "none",
  hideRollDetails: "none",
  displaySaveDC: true,
  checkSaveText: null,
  autoRollDamage: "none",
  autoApplyDamage: "none",
  damageImmunities: "none",
  autoItemEffects: null,
  rangeTarget: null,
  playerRollSaves: "none",
  playerSaveTimeout: 0,
  rollNPCSaves: "auto",
  preRollChecks: false,
  mergeCard: false,
  mergeCardCondensed: false,
  useTokenNames: false,
  requireTargets: false,
  fumbleSound: "",
  diceSound: "",
  criticalSound: "",
  itemUseSound: "",
  spellUseSound: "",
  weaponUseSound: "",
  potionUseSound: "",
  fullAuto: false,
  useCustomSounds: true,
  customSoundsPlaylist: "none",
  keyMapping: defaultKeyMapping,
  allowUseMacro: false,
  rollOtherDamage: false,
  removeButtons: "all",
  gmRemoveButtons: "all", 
  concentrationAutomation: false,
  singleConcentrationRoll: true
};

export let fetchParams = (silent = false) => {
  debug("Fetch Params Loading");
  configSettings = game.settings.get("midi-qol", "ConfigSettings");
  if (!configSettings.fumbleSound) configSettings.fumbleSound = CONFIG.sounds["dice"];
  if (!configSettings.criticalSound) configSettings.criticalSound = CONFIG.sounds["dice"];
  if (!configSettings.diceSound) configSettings.diceSound = CONFIG.sounds["dice"];
  if (!configSettings.keyMapping 
    || !configSettings.keyMapping["DND5E.Advantage"] 
    || !configSettings.keyMapping["DND5E.Disadvantage"]
    || !configSettings.keyMapping["DND5E.Critical"]) {
      configSettings.keyMapping = defaultKeyMapping;
  }

  //@ts-ignore typeLabels
  const itemList = Object.keys(CONFIG.Item?.typeLabels ?? {});
  if (!configSettings.itemTypeList && itemList.length > 0) {
    configSettings.itemTypeList = itemList;
  }

  enableWorkflow = game.settings.get("midi-qol", "EnableWorkflow");
  configSettings.preRollChecks = game.settings.get("midi-qol", "PreRollChecks")
  warn("Fetch Params Loading", configSettings);
  
  criticalDamage = game.settings.get("midi-qol", "CriticalDamage");
  itemDeleteCheck = game.settings.get("midi-qol", "ItemDeleteCheck");
  nsaFlag = game.settings.get("midi-qol", "showGM");
  coloredBorders = game.settings.get("midi-qol", "ColoredBorders");
  itemRollButtons = game.settings.get("midi-qol", "ItemRollButtons");
  addChatDamageButtons = game.settings.get("midi-qol", "AddChatDamageButtons")
  autoFastForwardAbilityRolls = game.settings.get("midi-qol", "AutoFastForwardAbilityRolls")
  autoRemoveTargets = game.settings.get("midi-qol", "AutoRemoveTargets");
  let debugText = game.settings.get("midi-qol", "Debug");
  forceHideRoll = game.settings.get("midi-qol", "ForceHideRoll")
  dragDropTargeting = game.settings.get("midi-qol", "DragDropTarget")

  setDebugLevel(debugText);
  if (configSettings.concentrationAutomation) {
    checkCubInstalled();
    checkConcentrationSettings();
  }
}

let getParams = () => {
  return ` 
    itemRollButtons: ${itemRollButtons} <br>
    speedItemRolls: ${configSettings.speedItemRolls} <br>
    autoTarget: ${configSettings.autoTarget} <br>
    autoCheckHit: ${configSettings.autoCheckHit} <br>
    autoCheckSaves: ${configSettings.autoCheckSaves} <br>
    autoApplyDamage: ${configSettings.autoApplyDamage} <br>
    autoRollDamage: ${configSettings.autoRollDamage} <br>
    playerRollSaves: ${configSettings.playerRollSaves} <br>
    checkBetterRolls: ${checkBetterRolls} `
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
    name: "AddChatDamageButtons",
    scope: "world",
    default: true,
    type: Boolean,
    config: true,
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
    name: "CriticalDamage",
    scope: "world",
    choices: {default: "DND5e default", maxDamage:  "base max only", maxCrit: "max critical dice", maxAll: "max all dice"},
    default: "default",
    type: String,
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
    name: "PreRollChecks",
    scope: "world",
    default: false,
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
]


export const registerSettings = function() {
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
    //@ts-ignore
    if (setting.choices) options.choices = setting.choices;
    game.settings.register("midi-qol", setting.name, options);
  });

  game.settings.register("midi-qol", "ColoredBorders", 
  {
    name: "midi-qol.ColoredBorders.Name",
    hint: "midi-qol.ColoredBorders.Hint",
    scope: "world",
    default: "None",
    type: String,
    config: true,
    choices: i18n("midi-qol.ColoredBordersOptions"),
    onChange: fetchParams
  });

  game.settings.register("midi-qol", "AutoRemoveTargets", {
    name: "midi-qol.AutoRemoveTargets.Name",
    hint: "midi-qol.AutoRemoveTargets.Hint",
    scope: "world",
    default: "dead",
    type: String,
    config: true,
    choices: i18n("midi-qol.AutoRemoveTargetsOptions"),
    onChange: fetchParams
  });

  game.settings.registerMenu("midi-qol", "midi-qol", {
    name: i18n("midi-qol.config"),
    label: "midi-qol.WorkflowSettings",
    hint: i18n("midi-qol.Hint"),
    icon: "fas fa-dice-d20",
    scope: "world",
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
    choices: {none: "None", warn: "warnings", debug: "debug", all: "all"},
    onChange: fetchParams
  });
}

