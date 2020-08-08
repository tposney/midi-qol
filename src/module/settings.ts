import { debug, setDebugLevel } from "../midi-qol";

export var itemRollButtons;
export var speedItemRolls;
export var autoShiftClick;
export var autoTarget;
export var autoCheckHit;
export var autoCheckSaves;
export var autoRollDamage;
export var criticalDamage;
export var addChatDamageButtons;
export var autoApplyDamage;
export var damageImmunities;
export var macroSpeedRolls;
export var hideNPCNames;
export var useTokenNames;
export var itemDeleteCheck;
export var nsaFlag;
export var autoItemEffects;
export var coloredBorders;
export var rangeTarget;
export var autoRemoveTargets;
export var checkBetterRolls;
export var playerRollSaves;
export var playerSaveTimeout;
export var preRollChecks;
export var saveRequests = {};
export var saveTimeouts = {};

export let fetchParams = (silent = false) => {
  debug("Fetch Params Loading");
  itemRollButtons = game.settings.get("midi-qol", "ItemRollButtons");
  speedItemRolls = game.settings.get("midi-qol", "SpeedItemRolls");
  autoShiftClick = game.settings.get("midi-qol", "AutoShiftClick");
  autoTarget = game.settings.get("midi-qol", "AutoTarget");
  autoCheckHit = game.settings.get("midi-qol", "AutoCheckHit");
  autoRemoveTargets = game.settings.get("midi-qol", "AutoRemoveTargets");
  autoCheckSaves = game.settings.get("midi-qol", "AutoCheckSaves");
  autoRollDamage = game.settings.get("midi-qol", "AutoRollDamage");
  criticalDamage = game.settings.get("midi-qol", "CriticalDamage");
  addChatDamageButtons = game.settings.get("midi-qol", "AddChatDamageButtons");
  autoApplyDamage = game.settings.get("midi-qol", "AutoApplyDamage");
  damageImmunities = game.settings.get("midi-qol", "DamageImmunities");
  macroSpeedRolls = game.settings.get("midi-qol", "MacroSpeedRolls");
  hideNPCNames = game.settings.get("midi-qol", "HideNPCNames");
  useTokenNames = game.settings.get("midi-qol", "UseTokenNames")
  itemDeleteCheck = game.settings.get("midi-qol", "ItemDeleteCheck");
  nsaFlag = game.settings.get("midi-qol", "showGM");
  autoItemEffects = game.settings.get("midi-qol", "AutoEffects");
  coloredBorders = game.settings.get("midi-qol", "ColoredBorders");
  rangeTarget = game.settings.get("midi-qol", "RangeTarget");
  playerRollSaves = game.settings.get("midi-qol", "PlayerRollSaves")
  playerSaveTimeout = game.settings.get("midi-qol", "PlayerSaveTimeout")
  preRollChecks = game.settings.get("midi-qol", "PreRollChecks")
  debug("FetchParams ", speedItemRolls, autoShiftClick, autoRollDamage, autoCheckHit)
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
    name: "SpeedItemRolls",
    scope: "world",
    default: "on",
    type: String,
    choices: {off: "Off", on: "On", onCard: "On + Show Item Card"},
    onChange: fetchParams //(value) => {window.location.reload()}
  },
  {
    name: "AutoShiftClick",
    scope: "world",
    default: true,
    type: Boolean,
    onChange: fetchParams //(value) => {window.location.reload()}
  },
  {
    name: "PreRollChecks",
    scope: "world",
    default: false,
    type: Boolean,
    onChange: fetchParams
  },
  {
    name: "AutoTarget",
    scope: "world",
    default: "wallsBlock",
    type: String,
    choices: {none: "None", always: "Always", wallsBlock: "Walls Block"},
    onChange: fetchParams
  },
  {
    name: "AutoCheckHit",
    scope: "world",
    choices: {none: "None", all: "Check - all see result", whisper: "Check - only GM sees", snotty: "Auto check + abuse"},
    default: "all",
    type: String,
    onChange: fetchParams
  },
  {
    name: "AutoCheckSaves",
    scope: "world",
    choices: {none: "None", all:  "Save - All see result", whisper: "Save - only GM sees", allShow: "Save - All see Result + Rolls"},
    default: "all",
    type: String,
    onChange: fetchParams
  },
  {
    name: "PlayerRollSaves",
    scope: "world",
    choices: {none: "None",  letme: "Let Me Roll That For You", chat: "Chat Message"},
    default: "none",
    config: true,
    type: String,
    onChange: fetchParams
  },
  {
    name: "PlayerSaveTimeout",
    scope: "world",
    default: 30,
    type: Number,
    config: true,
    onChange: fetchParams
  },
  {
    name: "AutoRollDamage",
    scope: "world",
    choices: {none: "None", always:  "Always", onHit: "Attack Hits"},
    default: "onHit",
    type: String,
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
    name: "AddChatDamageButtons",
    scope: "world",
    default: true,
    type: Boolean,
    onChange: fetchParams
  },
  {
    name: "AutoApplyDamage",
    scope: "world",
    default: "yesCard",
    type: String,
    choices: {none: "No", yes: "Yes", yesCard: "Yes + undo damage card"},
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
    name: "DamageImmunities",
    scope: "world",
    default: "savesDefault",
    type: String,
    choices: {none: "Never", savesDefault: "Apply saves - no text check", savesCheck: "Apply Saves - check text"},
    onChange: fetchParams
  },
  {
    name: "AutoEffects",
    scope: "world",
    default: true,
    type: Boolean,
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
    name: "HideNPCNames",
    scope: "world",
    default: true,
    type: Boolean,
    onChange: fetchParams
  },
  {
    name: "UseTokenNames",
    scope: "world",
    default: false,
    type: Boolean,
    onChange: fetchParams
  },
  {
    name: "ItemDeleteCheck",
    scope: "client",
    default: true,
    type: Boolean,
    choices: [],
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
    choices: {none: "None", borders: "Borders Only", borderNames: "Border + Name"},
    onChange: fetchParams
  },
  {
    name: "RangeTarget",
    scope: "world",
    default: false,
    type: Boolean,
    choices: [],
    onChange: fetchParams
  },
  {
    name: "Debug",
    scope: "world",
    default: "None",
    type: String,
    choices: {none: "None", warn: "warnings", debug: "debug", all: "all"},
    onChange: fetchParams
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
}

