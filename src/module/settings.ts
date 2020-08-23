import { debug, setDebugLevel, warn } from "../midi-qol";
import { ConfigPanel} from "./apps/ConfigPanel"

export var itemRollButtons: boolean;
export var speedItemRolls: string;
export var autoFastForward: string;
export var autoTarget: string;
export var autoCheckHit: string;
export var autoCheckSaves : string;
export var checkSaveText: boolean;
export var autoRollDamage: string;
export var criticalDamage: string;
export var addChatDamageButtons;
export var autoApplyDamage: string;
export var damageImmunities: string;
export var macroSpeedRolls: string;
export var hideNPCNames: string;
export var useTokenNames: boolean;
export var itemDeleteCheck: boolean;
export var nsaFlag: boolean;
export var autoItemEffects: boolean;
export var coloredBorders: string;
export var rangeTarget: boolean;
export var autoRemoveTargets: string;
export var checkBetterRolls: boolean;
export var playerRollSaves: string;
export var playerSaveTimeout: number;
export var preRollChecks: boolean;
export var saveRequests = {};
export var saveTimeouts = {};
export var mergeCard: boolean;
export var mergeCardCondensed: boolean;


export var configSettings = {
  speedItemRolls,
  autoFastForward,
  autoTarget,
  autoCheckHit,
  autoRemoveTargets,
  autoCheckSaves,
  checkSaveText,
  autoRollDamage,
  addChatDamageButtons,
  autoApplyDamage,
  damageImmunities,
  autoItemEffects,
  rangeTarget,
  playerRollSaves,
  playerSaveTimeout,
  preRollChecks,
  mergeCard,
  mergeCardCondensed,
  hideNPCNames,
  useTokenNames,
  requireTargets: false
};

export let fetchParams = (silent = false) => {
  debug("Fetch Params Loading");
  configSettings = game.settings.get("midi-qol", "ConfigSettings")
  warn("Fetch Params Loading", configSettings);
  speedItemRolls = configSettings.speedItemRolls;
  autoFastForward = configSettings.autoFastForward;
  autoTarget = configSettings.autoTarget;
  autoCheckHit = configSettings.autoCheckHit;
  autoRemoveTargets = configSettings.autoRemoveTargets;
  autoCheckSaves = configSettings.autoCheckSaves;
  checkSaveText = configSettings.checkSaveText;
  autoRollDamage = configSettings.autoRollDamage;
  addChatDamageButtons = configSettings.addChatDamageButtons;
  autoApplyDamage = configSettings.autoApplyDamage;
  damageImmunities = configSettings.damageImmunities;
  autoItemEffects = configSettings.autoItemEffects;
  rangeTarget = configSettings.rangeTarget;
  playerRollSaves = configSettings.playerRollSaves;
  playerSaveTimeout = configSettings.playerSaveTimeout;
  preRollChecks = configSettings.preRollChecks;
  mergeCard = configSettings.mergeCard;
  hideNPCNames = configSettings.hideNPCNames;
  useTokenNames = configSettings.useTokenNames;

  macroSpeedRolls = game.settings.get("midi-qol", "MacroSpeedRolls");
  criticalDamage = game.settings.get("midi-qol", "CriticalDamage");
  itemDeleteCheck = game.settings.get("midi-qol", "ItemDeleteCheck");
  nsaFlag = game.settings.get("midi-qol", "showGM");
  coloredBorders = game.settings.get("midi-qol", "ColoredBorders");
  itemRollButtons = game.settings.get("midi-qol", "ItemRollButtons");
  debug("FetchParams ", speedItemRolls, autoFastForward, autoRollDamage, autoCheckHit)
  let debugText = game.settings.get("midi-qol", "Debug");
  setDebugLevel(debugText);

}

let getParams = () => {
  return ` 
    itemRollButtons: ${itemRollButtons} <br>
    speedItemRolls: ${speedItemRolls} <br>
    autoTarget: ${autoTarget} <br>
    autoCheckHit: ${autoCheckHit} <br>
    autoCheckSaves: ${autoCheckSaves} <br>
    autoApplyDamage: ${autoApplyDamage} <br>
    autoRollDamage: ${autoRollDamage} <br>
    playerRollSaves: ${playerRollSaves} <br>
    checkBetterRolls: ${checkBetterRolls} `
}
const settings = [
  {
    name: "ItemRollButtons",
    scope: "world",
    default: true,
    type: Boolean,
    onChange: fetchParams
  },
  {
    name: "PreRollChecks",
    scope: "world",
    default: false,
    type: Boolean,
    onChange: fetchParams,
    config: false
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
    name: "AddChatDamageButtons",
    scope: "world",
    default: true,
    type: Boolean,
    config: false,
    onChange: fetchParams
  },
  {
    name: "AutoRemoveTargets",
    scope: "world",
    default: "dead",
    type: String,
    choices: {none: "Never", dead: "untarget dead", all: "untarget all"},
    onChange: fetchParams
  },
  {
    name: "AutoEffects",
    scope: "world",
    default: true,
    type: Boolean,
    config: false,
    onChange: fetchParams
  },
  {
    name: "MacroSpeedRolls",
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
    name: "ColoredBorders",
    scope: "world",
    default: "None",
    type: String,
    choices: {none: "None", borders: "Borders Only", borderNamesText: "Border + Name Text", borderNamesBackground: "Border + Name Background"},
    onChange: fetchParams
  },
  {
    name: "Debug",
    scope: "world",
    default: "None",
    type: String,
    choices: {none: "None", warn: "warnings", debug: "debug", all: "all"},
    onChange: fetchParams
  },
  {
    name: "ConfigSettings",
    scope: "world",
    type: Object,
    onChange: fetchParams,
    config: false
  }
]


export const registerSettings = function() {
  // Register any custom module settings here
  
  settings.forEach(setting => {
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
    console.log("setting name ", setting.name, options)
    game.settings.register("midi-qol", setting.name, options);
  });

  game.settings.registerMenu("midi-qol", "midi-qol", {
    name: "midi-qol config",
    label: "midi-qol.WorkflowSettings",
    hint: "midi-qol.Hint",
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
      choices: [],
      onChange: (value) => {window.location.reload()}
    });


  }
}

