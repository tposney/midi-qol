import { _mergeUpdate } from "@league-of-foundry-developers/foundry-vtt-types/src/foundry/common/utils/helpers.mjs";
import { config } from "@league-of-foundry-developers/foundry-vtt-types/src/types/augments/simple-peer";
import { debug, setDebugLevel, warn, i18n, checkConcentrationSettings, debugEnabled, geti18nTranslations } from "../midi-qol.js";
import { ConfigPanel} from "./apps/ConfigPanel.js"
import { SoundConfigPanel } from "./apps/SoundConfigPanel.js";
import { MidiSounds } from "./midi-sounds.js";
import { configureDamageRollDialog } from "./patching.js";

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
export var lateTargeting: string;
export var midiSoundSettings: any = {};
export var midiSoundSettingsBackup: any = undefined;


const defaultKeyMapping = {
  "DND5E.Advantage": "altKey", 
  "DND5E.Disadvantage": "ctrlKey", 
  "DND5E.Critical": "altKey",
  "DND5E.Versatile": "shiftKey"
};

class ConfigSettings {
  // fullAuto: boolean = false;
  addDead: string = "none";
  addWounded: number = 0;
  allowUseMacro: boolean = false;
  allowActorUseMacro: boolean = false;
  attackPerTarget: boolean = false;
  autoApplyDamage: string = "none";
  playerDamageCard: string = "none";
  playerCardDamageDifferent: boolean = false;
  hidePlayerDamageCard: boolean = true;
  autoCEEffects: string = "none";
  autoCheckHit: string = "none";
  autoCheckSaves: string = "none";
  autoFastForward: string = "off";
  autoItemEffects: string;
  autoRemoveTemplate: boolean;
  autoRollAttack: boolean = false;
  autoRollDamage: string = "none";
  autoTarget: string = "none";
  checkSaveText: boolean = false;
  concentrationAutomation: boolean = false;
  consumeResource: string = "none";
  convenientEffectsReaction: string = "Reaction";
  criticalSound: string = "";
  customSoundsPlaylist: string = "none";
  damageImmunities: string = "none";
  damageResistanceMultiplier: number = 0.5;
  damageVulnerabilityMultiplier: number = 2;
  defaultSaveMult: number = 0.5;
  diceSound: string = "";
  displayHitResultNumeric:boolean = true;
  displaySaveAdvantage: boolean = true;
  displaySaveDC: boolean = true;
  doReactions: string = "all";
  effectActivation: boolean = false;
  enableddbGL: boolean = false;
  enforceReactions = "none";
  enforceBonusActions = "none";
  fixStickyKeys: boolean = true;
  fumbleSound: string = "";
  ghostRolls: boolean = false;
  gmAutoAttack: boolean = false;
  gmAutoDamage: string = "none";
  gmAutoFastForwardAttack: boolean = false;
  gmAutoFastForwardDamage: boolean =  false;
  gmConsumeResource: string = "none";
  gmDoReactions: string = "all";
  gmHide3dDice: boolean = false;
  gmLateTargeting: string = "none";
  gmRemoveButtons: string = "all"; 
  hideRollDetails: string = "none";
  ignoreSpellReactionRestriction: boolean = false;
  itemRollStartWorkflow: boolean = false;
  itemTypeList: any = null;
  itemUseSound: string = "";
  keepRollStats: boolean = false;
  keyMapping = defaultKeyMapping;
  mergeCard: boolean = false;
  mergeCardCondensed: boolean = false;
  optionalRulesEnabled: boolean = false;
  paranoidGM : boolean = false;
  playerRollSaves: string = "none";
  playerSaveTimeout: number = 0;
  playerStatsOnly: boolean = false;
  potionUseSound: string = "";
  promptDamageRoll: boolean = false;
  quickSettings: boolean = true;
  rangeTarget: string = "none";
  reactionTimeout: number = 10;
  recordAOO = "none";
  removeButtons: string = "all";
  removeConcentration: boolean = true;
  requireMagical: string = "off";
  requiresTargets: string = "none";
  rollNPCLinkedSaves: string = "auto";
  rollNPCSaves: string = "auto";
  rollOtherDamage: string | boolean = "none";
  rollOtherSpellDamage: string | boolean = "none";
  saveStatsEvery: number = 20;
  showFastForward: boolean = false;
  showItemDetails: string = "";
  showReactionAttackRoll: string = "all";
  showReactionChatMessage: boolean = false;
  singleConcentrationRoll: boolean = true;
  spellHitSound: string = "";
  spellUseSound: string = "";
  spellUseSoundRanged: string = "";
  syrinToken: string | undefined = undefined;
  tempHPDamageConcentrationCheck: boolean = false;
  noConcnetrationDamageCheck: boolean = false;
  toggleOptionalRules: boolean = false;
  useCustomSounds: boolean = true;
  usePlayerPortrait: boolean = false;
  useTokenNames: boolean = false;
  weaponHitSound: string = "";
  weaponUseSound: string = "";
  weaponUseSoundRanged: string = "";
  rollAlternate: string = "off";
  optionalRules: any = {
    invisAdvantage: true,
    checkRange: true,
    wallsBlockRange: "center",
    nearbyFoe: 5,
    nearbyAllyRanged: 0,
    incapacitated: true,
    removeHiddenInvis: true,
    maxDRValue: false,
    distanceIncludesHeight: false,
    criticalSaves: false,
    activeDefence: false,
    challengModeArmor: false,
    checkFlanking: "off",
    optionalCritRule: -1,
    actionSpecialDurationImmediate: false
  };
}

export var configSettings = new ConfigSettings();

export function checkRule(rule: string) {
  let rulesEnabled = configSettings.optionalRulesEnabled;
  if (game.user?.isGM)
    rulesEnabled = rulesEnabled ? !configSettings.toggleOptionalRules : configSettings.toggleOptionalRules;
  return rulesEnabled && configSettings.optionalRules[rule];
}

export function collectSettingData() {
  let data = {
    configSettings,
    midiSoundSettings,
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
    //@ts-ignore
    coreVersion: game.version ?? game?.version,
    //@ts-ignore version v10
    systemVersion: game.system.version
  };
  data.flags["modules"] = {
    //@ts-ignore version v10
    abouttimeVersion: game.modules.get("about-time")?.version,
    //@ts-ignore version v10
    betterRollsVersion: game.modules.get("betterrolls5e")?.version,
    //@ts-ignore version v10
    cubVersion: game.modules.get("combat-utility-belt")?.version,
    //@ts-ignore version v10
    condvisVersion: game.modules.get("conditional-visibility")?.version,
    //@ts-ignore version v10
    daeVersion: game.modules.get("dae")?.version,
    //@ts-ignore version v10
    DSNversion: game.modules.get("dice-so-nice")?.version,
    //@ts-ignore version v10
    dndhelpersVersions: game.modules.get("dnd5e-helpers")?.version,
    //@ts-ignore version v10
    itemMacroVersion: game.modules.get("itemacro")?.version,
    //@ts-ignore version v10
    lmrtfyVersion: game.modules.get("lmrtfy")?.version,
    //@ts-ignore version v10
    midiQolVersion: game.modules.get("midi-qol")?.version,
    //@ts-ignore version v10
    monksVersion: game.modules.get("monks-tokenbar")?.version,
    //@ts-ignore version v10
    socketlibVersion: game.modules.get("socketlib")?.version,
    //@ts-ignore version v10
    simpleCalendarVersion: game.modules.get("foundryvtt-simple-calendar")?.version,
    //@ts-ignore version v10
    timesUpVersion: game.modules.get("times-up")?.version
  };
  data.flags["all-modules"] = 
  //@ts-ignore
    game.modules.filter(m=>m.active).map(m => {
      const mdata = m.toObject();
      return {
        name: mdata.name,
        title: mdata.title,
        description: mdata.description,
        url: mdata.url,
        version: mdata.version,
        compatibility: mdata.compatibility,
        relationships: mdata.relationships,
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
  if (typeof json === "string")
    json = JSON.parse(json);
  game.settings.set("midi-qol", "ConfigSettings", json.configSettings);
  game.settings.set("midi-qol", "ItemRollButtons", json.itemRollButtons);
  game.settings.set("midi-qol", "CriticalDamage", json.criticalDamage);
  game.settings.set("midi-qol", "ItemDeleteCheck", json.itemDeleteCheck);
  game.settings.set("midi-qol", "showGM", json.nsaFlag);
  game.settings.set("midi-qol", "ColoredBorders", json.coloredBorders);
  game.settings.set("midi-qol", "AddChatDamageButtons", json.addChatDamageButtons);
  game.settings.set("midi-qol", "AutoFastForwardAbilityRolls", json.autoFastForwardAbilityRolls);
  game.settings.set("midi-qol", "AutoRemoveTargets", json.autoRemoveTargets);
  game.settings.set("midi-qol", "ForceHideRoll", json.forceHideRoll);
  game.settings.set("midi-qol", "EnableWorkflow", json.enableWorkflow);
  game.settings.set("midi-qol", "DragDropTarget", json.dragDropTargeting);
  game.settings.set("midi-qol", "MidiSoundSettings", json.midiSoundSettings ?? {});
}
export let fetchSoundSettings = () => {
  midiSoundSettings = game.settings.get("midi-qol", "MidiSoundSettings") ?? {};
  if (midiSoundSettings.version === undefined) {
    midiSoundSettingsBackup = duplicate(midiSoundSettings);
    midiSoundSettings = {"any": midiSoundSettings};
    midiSoundSettings.version = "0.9.48";
  }
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
  if (configSettings.convenientEffectsReaction === undefined) configSettings.convenientEffectsReaction = "Reaction"; //TODO come back when it is configurable in midi and set it to ""
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
  if (typeof configSettings.gmConsumeResource !== "string") configSettings.gmConsumeResource = "none";
  if (typeof configSettings.consumeResource !== "string") configSettings.consumeResource = "none";
  if (!configSettings.enableddbGL) configSettings.enableddbGL = false;
  if (!configSettings.showReactionChatMessage) configSettings.showReactionChatMessage = false;
  if (!configSettings.gmLateTargeting) configSettings.gmLateTargeting = "none";
  if (typeof configSettings.gmLateTargeting === "boolean" && configSettings.gmLateTargeting === true) configSettings.gmLateTargeting = "all";
  if (configSettings.fixStickyKeys === undefined) configSettings.fixStickyKeys = true;
  //@ts-ignore legacy boolean value
  if (configSettings.autoCEEffects === true) configSettings.autoCEEffects = "both";
  if (!configSettings.autoCEEffects) configSettings.autoCEEffects = "none";
  configSettings.toggleOptionalRules = false;
  if (configSettings.displaySaveAdvantage === undefined) configSettings.displaySaveAdvantage = true;
  if (!configSettings.recordAOO) configSettings.recordAOO = "none";
  if (!configSettings.enforceReactions) configSettings.enforceReactions = "none";
  if (!configSettings.enforceBonusActions) configSettings.enforceBonusActions = "none";
  //@ts-ignore
  if (configSettings.autoItemEffects === false) configSettings.autoItemEffects = "off";
  //@ts-ignore
  if (configSettings.autoItemEffects === true) configSettings.autoItemEffects = "applyRemove";
  if (configSettings.playerDamageCard === undefined) configSettings.playerDamageCard = "none";
  if (configSettings.playerCardDamageDifferent === undefined) configSettings.playerCardDamageDifferent = true;
  if (configSettings.displayHitResultNumeric === undefined) configSettings.displayHitResultNumeric = false;
  if (configSettings.rollAlternate === undefined) configSettings.rollAlternate = "off";
  //@ts-ignore
  if (configSettings.rollAlternate === false) configSettings.rollAlternate = "off";
  //@ts-ignore
  if (configSettings.rollAlternate === true) configSettings.rollAlternate = "formula";
  if (configSettings.allowActorUseMacro === undefined) configSettings.allowActorUseMacro = configSettings.allowUseMacro;

  if (!configSettings.keyMapping 
    || !configSettings.keyMapping["DND5E.Advantage"] 
    || !configSettings.keyMapping["DND5E.Disadvantage"]
    || !configSettings.keyMapping["DND5E.Critical"]) {
      configSettings.keyMapping = defaultKeyMapping;
  }

 // MidiSounds.setupBasicSounds();
 // migrateExistingSounds();

  if (configSettings.addWounded === undefined) configSettings.addWounded = 0;
  if (!configSettings.addDead) configSettings.addDead = "none";
  if (typeof configSettings.addDead === "boolean" && configSettings.addDead) configSettings.addDead = "overlay"
  if (configSettings.paranoidGM === undefined) configSettings.paranoidGM = false;
  if (typeof configSettings.requiresTargets !== "string") configSettings.requiresTargets = "none";
  if (configSettings.tempHPDamageConcentrationCheck === undefined) configSettings.tempHPDamageConcentrationCheck = false;
  if (configSettings.showFastForward === undefined) configSettings.showFastForward = true;
  configSettings.optionalRules = mergeObject({
      invisAdvantage: true,
      checkRange: true,
      wallsBlockRange: "center",
      nearbyFoe: 5,
      nearbyAllyRanged: 0,
      incapacitated: true,
      removeHiddenInvis: true,
      maxDRValue: false,
      distanceIncludesHeight: false,
      criticalSaves: false,
      activeDefence: false,
      challengeModeArmor: false,
      challengeModeArmorScale: false,
      checkFlanking: "off",
      optionalCritRule: -1,
      actionSpecialDurationImmediate: false

    }, configSettings.optionalRules ?? {}, {overwrite: true, insertKeys: true, insertValues: true});
  if (!configSettings.optionalRules.wallsBlockRange) configSettings.optionalRules.wallsBlockRange = "center";
  if (configSettings.optionalRules.checkFlanking === true) configSettings.optionalRules.checkFlanking = "ceadv";
  if (configSettings.optionalRules.checkFlanking === false) configSettings.optionalRules.checkFlanking = "off";
  if (typeof configSettings.requireMagical !== "string" && configSettings.requireMagical !== true) configSettings.requireMagical = "off";
  if (typeof configSettings.requireMagical !== "string" && configSettings.requireMagical === true) configSettings.requireMagical = "nonspell";

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
  if (configSettings.ignoreSpellReactionRestriction === undefined) configSettings.ignoreSpellReactionRestriction = false;
  if (configSettings.damageResistanceMultiplier === undefined) configSettings.damageResistanceMultiplier = 0.5;
  if (configSettings.damageVulnerabilityMultiplier === undefined) configSettings.damageVulnerabilityMultiplier = 2;
  if (configSettings.hidePlayerDamageCard === undefined) configSettings.hidePlayerDamageCard = true;
  if (configSettings.attackPerTarget === undefined) configSettings.attackPerTarget = false;
  if (configSettings.autoRemoveTemplate === undefined) configSettings.autoRemoveTemplate = true;
  configSettings.hidePlayerDamageCard = true;
  configSettings.quickSettings = true;
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
  const lateTargetingSetting = game.settings.get("midi-qol", "LateTargeting");
  if (!lateTargetingSetting) lateTargeting = "none";
  if (lateTargetingSetting === true || lateTargetingSetting === "true") lateTargeting = "all";
  else lateTargeting = String(lateTargetingSetting);

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
    scope: "client",
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
    name: "ConfigSettings",
    scope: "world",
    type: Object,
    default: configSettings,
    onChange: fetchParams,
    config: false
  },
  {
    name: "MidiSoundSettings",
    scope: "world",
    type: Object,
    default: midiSoundSettings,
    onChange: fetchSoundSettings,
    config: false
  },
  {
    name: "MidiSoundSettings-backup",
    scope: "world",
    type: Object,
    default: {},
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

  game.settings.register("midi-qol", "LateTargeting",
  {
    name: "midi-qol.LateTargeting.Name",
    hint: "midi-qol.LateTargeting.Hint",
    scope: "client",
    default: "none",
    type: String,
    config:true,
    choices: translations["LateTargetingOptions"],
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

  game.settings.registerMenu("midi-qol", "midi-qol-sounds", {
    name: i18n("midi-qol.SoundSettings.Name"),
    label: "midi-qol.SoundSettings.Label",
    hint: i18n("midi-qol.SoundSettings.Hint"),
    icon: "fas fa-dice-d20",
    type: SoundConfigPanel,
    restricted: true
  });

  game.settings.register("midi-qol", "playerControlsInvisibleTokens", {
    name: game.i18n.localize("midi-qol.playerControlsInvisibleTokens.Name"),
    hint: game.i18n.localize("midi-qol.playerControlsInvisibleTokens.Hint"),
    scope: "world",
    default: false,
    config: true,
    type: Boolean,
    //@ts-ignore v10
    requiresReload: true
  });

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

  game.settings.register("midi-qol", "debugCallTiming", {
    name: "midi-qol.debugCallTiming.Name",
    hint: "midi-qol.debugCallTiming.Hint",
    scope: "world",
    default: false,
    type: Boolean,
    config: true,
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

  game.settings.register("midi-qol", "splashWarnings", {
    name: "",
    hint: "",
    scope: "world",
    type: Boolean,
    config: false,
    default: true
  })
}

export function disableWorkflowAutomation() {
  enableWorkflow = false;
}
/*
export function migrateExistingSounds() {
  if (!configSettings.useCustomSounds) return;
  const playlist = game.playlists?.get(configSettings.customSoundsPlaylist);
  if (!playlist) {
    ui.notifications?.warn("Specified playlist does not exist. Aborting migration");
    return;
  }
  // create basic settings for the setup
  // if (!configSettings.midiSoundSettings) MidiSounds.setupBasicSounds();
  //@ts-ignore .sounds
  const sounds = playlist.sounds;
  const fumbleSound = sounds.get(configSettings.fumbleSound)?.name ?? "none";
  const diceSound = sounds.get(configSettings.diceSound)?.name ?? "none";
  const criticalSound = sounds.get(configSettings.criticalSound)?.name ?? "none";
  const itemUseSound = sounds.get(configSettings.itemUseSound)?.name ?? "none";
  const spellUseSound = sounds.get(configSettings.spellUseSound)?.name ?? "none";
  const potionUseSound = sounds.get(configSettings.potionUseSound)?.name ?? "none";
  const weaponUseSound = sounds.get(configSettings.weaponUseSound)?.name ?? "none";
  const weaponUseSoundRanged = sounds.get(configSettings.weaponUseSoundRanged)?.name ?? "none";
  const spellUseSoundRanged = sounds.get(configSettings.spellUseSoundRanged)?.name ?? "none";

  midiSoundSettings = mergeObject(midiSoundSettings, {
    all: {
      critical: { playlistName: playlist.name, soundName: criticalSound },
      fumble: { playlistName: playlist.name, soundName: fumbleSound },
      itemRoll: { playlistName: playlist.name, soundName: itemUseSound },
    },
    weapon: {
      itemRoll: { playlistName: playlist.name, soundName: "none" },
      mwak: { playlistName: playlist.name, soundName: weaponUseSound },
      rwak: { playlistName: playlist.name, soundName: weaponUseSoundRanged },
      attack: { playlistName: playlist.name, soundName: weaponUseSound }
    },
    spell: {
      itemRoll: { playlistName: playlist.name, soundName: "none" },
      msak: { playlistName: playlist.name, soundName: spellUseSound },
      rsak: { playlistName: playlist.name, soundName: spellUseSoundRanged },
      attack: { playlistName: playlist.name, soundName: spellUseSound }
    },
    "consumable:potion": {
      itemRoll: { playlistName: playlist.name, soundName: potionUseSound },
    }
  }, {overwrite: true})
}
*/