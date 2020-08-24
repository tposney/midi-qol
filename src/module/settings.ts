import { debug, setDebugLevel, warn, i18n } from "../midi-qol";
import { ConfigPanel} from "./apps/ConfigPanel"

export var itemRollButtons: boolean;
export var criticalDamage: string;
export var macroSpeedRolls: string;
export var itemDeleteCheck: boolean;
export var nsaFlag: boolean;
export var coloredBorders: string;
export var checkBetterRolls: boolean;
export var saveRequests = {};
export var saveTimeouts = {};
export var addChatDamageButtons: boolean;


export var configSettings = {
  speedItemRolls: "",
  autoFastForward: "",
  autoTarget: "",
  autoCheckHit: null,
  autoRemoveTargets: null,
  autoCheckSaves: "",
  checkSaveText: null,
  autoRollDamage: "",
  autoApplyDamage: "",
  damageImmunities: "",
  autoItemEffects: null,
  rangeTarget: null,
  playerRollSaves: "",
  playerSaveTimeout: 0,
  preRollChecks: null,
  mergeCard: null,
  mergeCardCondensed: null,
  hideNPCNames: "",
  useTokenNames: null,
  requireTargets: null
};

export let fetchParams = (silent = false) => {
  debug("Fetch Params Loading");
  configSettings = game.settings.get("midi-qol", "ConfigSettings")
  warn("Fetch Params Loading", configSettings);
  macroSpeedRolls = game.settings.get("midi-qol", "MacroSpeedRolls");
  criticalDamage = game.settings.get("midi-qol", "CriticalDamage");
  itemDeleteCheck = game.settings.get("midi-qol", "ItemDeleteCheck");
  nsaFlag = game.settings.get("midi-qol", "showGM");
  coloredBorders = game.settings.get("midi-qol", "ColoredBorders");
  itemRollButtons = game.settings.get("midi-qol", "ItemRollButtons");
  debug("FetchParams ", configSettings.speedItemRolls, configSettings.autoFastForward, configSettings.autoRollDamage, configSettings.autoCheckHit)
  let debugText = game.settings.get("midi-qol", "Debug");
  setDebugLevel(debugText);

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
      choices: [],
      onChange: (value) => {window.location.reload()}
    });


  }
}

