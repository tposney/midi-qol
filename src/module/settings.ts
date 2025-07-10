import { debug, setDebugLevel, i18n, debugEnabled, geti18nTranslations, geti18nOptions, error } from "../midi-qol.js";
import { ConfigPanel } from "./apps/ConfigPanel.js"
import { SoundConfigPanel } from "./apps/SoundConfigPanel.js";
import { TroubleShooter } from "./apps/TroubleShooter.js";
import { TargetConfirmationConfig } from "./apps/TargetConfirmationConfig.js";
import { _updateAction } from "./utils.js";
import { Workflow } from "./Workflow.js";

export var itemRollButtons: boolean;
export var criticalDamage: string;
export var criticalDamageGM: string;
export var nsaFlag: boolean;
export var coloredBorders: string;
export var saveRequests = {};
export var saveTimeouts = {};
export var addChatDamageButtonsOld: string;
export var autoFastForwardAbilityRolls: boolean;
export var autoRemoveTargets: string;
export var forceHideRoll: boolean;
export var enableWorkflow: boolean;
export var dragDropTargeting: boolean;
export var targetConfirmation: any;
export var midiSoundSettings: any = {};
export var midiSoundSettingsBackup: any = undefined;
export var DebounceInterval: number;
export var _debouncedUpdateAction;
export var ReplaceDefaultActivities: boolean = true;
export var UseWeakReferences: boolean = false;
export var SaveToChatCard: boolean = false;

export const defaultTargetConfirmationSettings = {
  enabled: false,
  always: false,
  noneTargeted: false,
  hasAttack: false,
  hasCreatureTarget: false,
  targetSelf: false,
  hasAoE: false,
  hasRangedAoE: false,
  longRange: false,
  inCover: false,
  mixedDisposition: false,
  gridPosition: { x: 0, y: 0 }
};

const defaultKeyMapping = {
  "DND5E.Advantage": "altKey",
  "DND5E.Disadvantage": "ctrlKey",
  "DND5E.Critical": "altKey",
  "DND5E.Versatile": "shiftKey"
};

class ConfigSettings {
  // fullAuto: boolean = false;
  addChatDamageButtons: string = "none";
  addDead: string = "none";
  addFakeDice: boolean = false;
  addWounded: number = 0;
  addWoundedStyle: string = "none";
  activityNamePrefix: boolean = true;
  activationAutomation: string = "chat";
  midiWoundedCondition: string = "none";
  midiDeadCondition: string = "none";
  midiUnconsciousCondition: string = "none";
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
  autoItemEffects: string = "off";
  autoRemoveSummonedCreature: boolean = false;
  autoRemoveTemplate: boolean = true;
  autoRemoveInstantaneousTemplate: boolean = false;
  autoRollAttack: boolean = false;
  autoRollDamage: string = "none";
  autoCompleteWorkflow = false;
  saveDROrder = "SaveDRdr";
  autoTarget: string = "none";
  averageDamage: string = "none";
  checkSaveText: boolean = false;
  checkTwoHanded: boolean = false;
  chooseAmmunition: boolean = true;
  collapsibleTargets: boolean = true;
  concentrationAutomation: boolean = false;
  confirmAmmunition: boolean = false;
  gmConfirmAmmunition: boolean = false;
  consumeResource: string = "none";
  convenientEffectsReaction: string = "Reaction";
  criticalSound: string = "";
  customSoundsPlaylist: string = "none";
  damageImmunities: string = "none";
  damageImmunityMultiplier: number = 0.0;
  damageResistanceMultiplier: number = 0.5;
  damageVulnerabilityMultiplier: number = 2;
  defaultSaveMultiplier: number = 0.5;
  diceSound: string = "";
  displayHitResultNumeric: boolean = true;
  displaySaveAdvantage: boolean = true;
  displaySaveDC: boolean = true;
  doConcentrationCheck: string = "chat";
  griddedGridless: boolean = false;
  gridlessFudge: number | undefined = 0;
  doReactions: string = "all";
  effectActivation: boolean = false;
  enableDDBGL: boolean = false;
  enforceReactions = "none";
  enforceBonusActions = "none";
  enforceSingleWeaponTarget: boolean = false;
  fixStickyKeys: boolean = true;
  fumbleSound: string = "";
  ghostRolls: boolean = false;
  gmAutoAttack: boolean = false;
  gmAutoDamage: string = "none";
  gmAutoFastForwardAttack: boolean = false;
  gmAutoFastForwardDamage: boolean = false;
  gmConsumeResource: string = "none";
  gmDoReactions: string = "all";
  gmHide3dDice: boolean = false;
  gmLateTargeting: string = "none";
  gmRemoveButtons: string = "all";
  gmAttackDamageCards: boolean = false;
  hideRollDetails: string = "none";
  ignoreSpellReactionRestriction: boolean = false;
  itemRollStartWorkflow: boolean = false;
  itemTypeList: string[] | undefined = undefined;
  itemUseSound: string = "";
  keepRollStats: boolean = false;
  keyMapping = defaultKeyMapping;
  mergeCardCondensed: boolean = false;
  mergeCardMulti: boolean = false;
  mergeCardMultiDamage: boolean = false;
  midiPropertiesTabRole: number = CONST.USER_ROLES.PLAYER;
  confirmAttackDamage: string = "none";
  highlightSuccess: boolean = false;
  highLightCriticalAttackOnly: boolean = false;
  markPlayerDefeated: boolean = false;
  markNonPlayerDefeated: boolean = false;
  optionalRulesEnabled: boolean = false;
  paranoidGM: boolean = false;
  playerRollSaves: string = "none";
  playerSaveTimeout: number = 0;
  playerStatsOnly: boolean = false;
  potionUseSound: string = "";
  quickSettings: boolean = true;
  rangeTarget: string = "none";
  useTemplateRangedTargeting: boolean = false;
  reactionTimeout: number = 10;
  recordAOO = "none";
  removeButtons: string = "all";
  removeConcentration: boolean = true;
  removeConcentrationEffects: string = "effects";
  playerRequireAmmunition: boolean = false;
  gmRequireAmmunition: boolean = false;
  requireMagical: string = "off";
  requiresTargets: string = "none";
  rollNPCLinkedSaves: string = "auto";
  rollNPCSaves: string = "auto";
  rollChecksBlind: string[] = [];
  rollSavesBlind: string[] = [];
  rollSkillsBlind: string[] = [];
  saveStatsEvery: number = 20;
  showDSN: boolean = true;
  showFastForward: boolean = false;
  showItemDetails: string = "all";
  showReactionAttackRoll: string = "all";
  showReactionChatMessage: boolean = false;
  singleConcentrationRoll: boolean = true;
  skillAbilityCheckAdvantage: boolean = true;
  spellHitSound: string = "";
  spellUseSound: string = "";
  spellUseSoundRanged: string = "";
  tempHPDamageConcentrationCheck: boolean = false;
  concentrationIncapacitatedConditionCheck: boolean = false;
  toggleOptionalRules: boolean = false;
  useCustomSounds: boolean = true;
  usePlayerPortrait: boolean = false;
  useTokenNames: boolean = false;
  undoChatColor: string = "Delete";
  undoWorkflow: boolean = false;
  //v3DamageApplication: boolean = true;
  useDamageDetail: boolean = true;
  weaponHitSound: string = "";
  weaponUseSound: string = "";
  weaponUseSoundRanged: string = "";
  rollAlternate: string = "off";
  optionalRules: any = {
    actionSpecialDurationImmediate: false,
    activeDefence: false,
    activeDefenceShow: "selfroll",
    autoRerollInitiative: false,
    challengeModeArmor: "none",
    checkFlanking: "off",
    checkRange: "longFail",
    coverCalculation: "none",
    criticalNat20: false,
    criticalSaves: false,
    displayBonusRolls: true,
    distanceIncludesHeight: false,
    DRAllPerDamageDetail: true,
    hiddenAdvantage: "none",
    incapacitated: "nothing",
    invisAdvantage: "RAW",
    invisVision: false,
    maxDRValue: false,
    nearbyAllyRanged: 0,
    nearbyFoe: 5,
    optionalCritRule: -1,
    removeHiddenInvis: true,
    vitalityResource: "",
    wallsBlockRange: "center",

  };
}

export var configSettings = new ConfigSettings();

export function checkMechanic(mechanic: string): any {
  if (configSettings.toggleOptionalRules) return false;
  return configSettings.optionalRules[mechanic];
}

export function checkRule(rule: string) {
  let rulesEnabled = configSettings.optionalRulesEnabled;
  if (game.user?.isGM)
    rulesEnabled = rulesEnabled ? !configSettings.toggleOptionalRules : configSettings.toggleOptionalRules;
  return rulesEnabled && configSettings.optionalRules[rule];
}

export const checkedModuleList = [
  "about-time",
  "ActiveAuras",
  "autoanimations",
  "anonymous",
  "babonus",
  "chris-premades",
  "condition-lab-triggler",
  "dae",
  "ddb-importer",
  "ddb-game-log",
  "df-templates",
  "dice-so-nice",
  "effectmacro",
  "itemacro",
  /levels/,
  "lib-wrapper",
  "multilevel-tokens",
  "sequencer",
  "simbuls-cover-calculator",
  "socketlib",
  "times-up",
  "tokenmagic",
  "walledtemplates",
  "warpgate",
  "wjmaia",
]

export const CheckedAuthorsList = [
  "hell",
  "dfreds",
  // "theripper93", - just too many modules :)
  "ironmonk"
]

export function collectSettingData() {
  let data = {
    configSettings,
    midiSoundSettings,
    itemRollButtons,
    criticalDamage,
    criticalDamageGM,
    nsaFlag,
    coloredBorders,
    // addChatDamageButtons,
    autoFastForwardAbilityRolls,
    autoRemoveTargets,
    forceHideRoll,
    enableWorkflow,
    dragDropTargeting,
    DebounceInterval,
    targetConfirmation,
    flags: {}
  };
  data.flags["exportSource"] = {
    system: game.system?.id,
    coreVersion: game.version ?? game?.version,
    //@ts-expect-error version
    systemVersion: game.system.version,
    //@ts-expect-error
    midiVersion: game.modules.get("midi-qol")?.version,
  };
  return data;
}
export function exportSettingsToJSON() {
  const filename = `fvtt-midi-qol-settings.json`;
  saveDataToFile(JSON.stringify(collectSettingData(), null, 2), "text/json", filename);
}

function removeOldValues(theObject: any) {
  if (typeof theObject !== "object") return theObject;
  Object.keys(theObject).forEach(key => {
    if (theObject[key]?.newValue !== undefined) {
      theObject[key] = theObject[key].newValue;
    }
  });
  return theObject;
}
export async function importSettingsFromJSON(json) {
  if (typeof json === "string")
    json = JSON.parse(json);
  if (json.midiSettings) { // this is a trouble shooter file
    json = json.midiSettings;
  }

  //@ts-expect-error
  await game.settings?.set("midi-qol", "ConfigSettings", removeOldValues(json.configSettings));
  // await game.settings?.set("midi-qol", "ItemRollButtons", removeOldValues(json.itemRollButtons));
  //@ts-expect-error
  await game.settings?.set("midi-qol", "CriticalDamage", removeOldValues(json.criticalDamage));
  //@ts-expect-error
  await game.settings?.set("midi-qol", "CriticalDamageGM", removeOldValues(json.criticalDamageGM));
  //@ts-expect-error
  await game.settings?.set("midi-qol", "showGM", removeOldValues(json.nsaFlag));
  //@ts-expect-error
  await game.settings?.set("midi-qol", "ColoredBorders", removeOldValues(json.coloredBorders));
  // @ ts-expect-error
  // await game.settings?.set("midi-qol", "AddChatDamageButtons", removeOldValues(json.addChatDamageButtons));
  //@ts-expect-error
  await game.settings?.set("midi-qol", "AutoFastForwardAbilityRolls", removeOldValues(json.autoFastForwardAbilityRolls));
  //@ts-expect-error
  await game.settings?.set("midi-qol", "AutoRemoveTargets", removeOldValues(json.autoRemoveTargets));
  //@ts-expect-error
  await game.settings?.set("midi-qol", "ForceHideRoll", removeOldValues(json.forceHideRoll));
  //@ts-expect-error
  await game.settings?.set("midi-qol", "EnableWorkflow", removeOldValues(json.enableWorkflow));
  //@ts-expect-error
  await game.settings?.set("midi-qol", "DragDropTarget", removeOldValues(json.dragDropTargeting));
  //@ts-expect-error
  await game.settings?.set("midi-qol", "DebounceInterval", removeOldValues(json.DebounceInterval));
  //@ts-expect-error
  await game.settings?.set("midi-qol", "TargetConfirmation", removeOldValues(json.targetConfirmation));
  //@ts-expect-error
  await game.settings?.set("midi-qol", "MidiSoundSettings", removeOldValues(json.midiSoundSettings) ?? {});
  //@ts-expect-error _sheet
  const settingsAppId = game.settings?._sheet?.appId;
  if (settingsAppId) ui.windows[settingsAppId]?.render(true);
  const exportSource = json.flags?.exportSource;
  ui.notifications?.notify(`Importing settings from foundry version ${exportSource?.coreVersion} dnd ${exportSource?.systemVersion} midi ${exportSource?.midiVersion}`);
}
export let fetchSoundSettings = () => {
  //@ts-expect-error
  midiSoundSettings = game.settings?.get("midi-qol", "MidiSoundSettings") ?? {};
  if (midiSoundSettings.version === undefined) {
    midiSoundSettingsBackup = foundry.utils.duplicate(midiSoundSettings);
    midiSoundSettings = { "any": midiSoundSettings };
    midiSoundSettings.version = "0.9.48";
  }
}

export let fetchParams = () => {
  if (debugEnabled > 1) debug("Fetch Params Loading");
  const blfxActive = game.modules?.get("boss-loot-assets-premium")?.active || game.modules?.get("boss-loot-assets-free")?.active;

  //@ts-expect-error
  configSettings = game.settings?.get("midi-qol", "ConfigSettings");
  //TODO create a config.html for this
  if (configSettings.saveDROrder === undefined) configSettings.saveDROrder = "DRSavedr";
  if (!configSettings.fumbleSound) configSettings.fumbleSound = CONFIG.sounds["dice"];
  if (!configSettings.criticalSound) configSettings.criticalSound = CONFIG.sounds["dice"];
  if (!configSettings.diceSound) configSettings.diceSound = CONFIG.sounds["dice"];
  if (!configSettings.doReactions) configSettings.doReactions = "none";
  if (!configSettings.gmDoReactions) configSettings.gmDoReactions = "none";
  if (configSettings.reactionTimeout === undefined) configSettings.reactionTimeout = 0;
  if (configSettings.convenientEffectsReaction === undefined) configSettings.convenientEffectsReaction = "Reaction"; //TODO come back when it is configurable in midi and set it to ""
  if (typeof configSettings.rangeTarget !== "string") configSettings.rangeTarget = "none";
  if (!configSettings.showReactionAttackRoll === undefined) configSettings.showReactionAttackRoll = "all";
  if (!configSettings.rollChecksBlind) configSettings.rollChecksBlind = [];
  configSettings.rollChecksBlind = configSettings.rollChecksBlind.filter((item) => item !== "none");
  //@ts-expect-error type mismatch - this is for legacy true setting
  if (configSettings.rollChecksBlind === true) configSettings.rollChecksBlind = ["all"];
  if (!configSettings.rollSavesBlind) configSettings.rollSavesBlind = [];
  configSettings.rollSavesBlind = configSettings.rollSavesBlind.filter((item) => item !== "none");
  //@ts-expect-error type mismatch - this is for legacy true setting
  if (configSettings.rollSavesBlind === true) configSettings.rollSavessBlind = ["all"];
  if (!configSettings.rollSkillsBlind) configSettings.rollSkillsBlind = [];
  configSettings.rollSkillsBlind = configSettings.rollSkillsBlind.filter((item) => item !== "none");
  //@ts-expect-error type mismatch - this is for legacy true setting
  if (configSettings.rollSkillsBlind === true) configSettings.rollSkillsBlind = ["all"];
  if (configSettings.gmHide3dDice === undefined) configSettings.gmHide3dDice = false;
  if (configSettings.ghostRolls === undefined) configSettings.ghostRolls = false;
  if (configSettings.addFakeDice === undefined) configSettings.addFakeDice = false;
  if (typeof configSettings.gmConsumeResource !== "string") configSettings.gmConsumeResource = "none";
  if (typeof configSettings.consumeResource !== "string") configSettings.consumeResource = "none";
  if (!configSettings.enableDDBGL) configSettings.enableDDBGL = false;
  if (!configSettings.showReactionChatMessage) configSettings.showReactionChatMessage = false;
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
  if (configSettings.playerDamageCard === undefined) configSettings.playerDamageCard = "none";
  if (configSettings.playerCardDamageDifferent === undefined) configSettings.playerCardDamageDifferent = true;
  if (configSettings.displayHitResultNumeric === undefined) configSettings.displayHitResultNumeric = false;
  if (configSettings.rollAlternate === undefined) configSettings.rollAlternate = "off";
  //@ts-ignore
  if (configSettings.rollAlternate === false) configSettings.rollAlternate = "off";
  //@ts-ignore
  if (configSettings.rollAlternate === true) configSettings.rollAlternate = "formula";
  if (configSettings.allowActorUseMacro === undefined) configSettings.allowActorUseMacro = configSettings.allowUseMacro;
  if (configSettings.skillAbilityCheckAdvantage === undefined) configSettings.skillAbilityCheckAdvantage = true;
  if (!configSettings.keyMapping
    || !configSettings.keyMapping["DND5E.Advantage"]
    || !configSettings.keyMapping["DND5E.Disadvantage"]
    || !configSettings.keyMapping["DND5E.Critical"]) {
    configSettings.keyMapping = defaultKeyMapping;
  }

  // MidiSounds.setupBasicSounds();
  // migrateExistingSounds();

  if (configSettings.addWounded === undefined) configSettings.addWounded = 0;
  if (configSettings.addWounded > 0 && configSettings.addWoundedStyle === undefined)
    configSettings.addWoundedStyle = "normal";
  if (!configSettings.addDead) configSettings.addDead = "none";
  if (typeof configSettings.addDead === "boolean" && configSettings.addDead) configSettings.addDead = "overlay"
  if (configSettings.paranoidGM === undefined) configSettings.paranoidGM = false;
  if (typeof configSettings.requiresTargets !== "string") configSettings.requiresTargets = "none";
  if (configSettings.tempHPDamageConcentrationCheck === undefined) configSettings.tempHPDamageConcentrationCheck = false;
  if (configSettings.showDSN === undefined) configSettings.showDSN = true;
  if (configSettings.showFastForward === undefined) configSettings.showFastForward = true;
  if (configSettings.highlightSuccess === undefined) configSettings.highlightSuccess = false;
  if (configSettings.highLightCriticalAttackOnly === undefined) configSettings.highLightCriticalAttackOnly = false;
  configSettings.optionalRules = foundry.utils.mergeObject({ // eventually split this into mechanics and rules
    actionSpecialDurationImmediate: false,
    activeDefence: false,
    activeDefenceShow: "selfroll",
    challengeModeArmor: "none",
    challengeModeArmorScale: false,
    checkFlanking: "off",
    checkRange: "longfail",
    coverCalculation: "none",
    displayBonusRolls: true,
    criticalNat20: false,
    criticalSaves: false,
    distanceIncludesHeight: false,
    incapacitated: "nothing",
    invisAdvantage: "RAW",
    hiddenAdvantage: "none",
    maxDRValue: false,
    DRAllPerDamageDetail: true,
    nearbyAllyRanged: 0,
    nearbyFoe: 5,
    optionalCritRule: -1,
    removeHiddenInvis: true,
    wallsBlockRange: "center",
    mergeCardMulti: false,
    mergeCardMultiDamage: false,
  }, configSettings.optionalRules ?? {}, { overwrite: true, insertKeys: true, insertValues: true });
  if (!configSettings.optionalRules.incapacitated) configSettings.optionalRules.incapacitated = "nothing";
  if (!configSettings.optionalRules.wallsBlockRange) configSettings.optionalRules.wallsBlockRange = "center";
  if (configSettings.optionalRules.checkFlanking === true) configSettings.optionalRules.checkFlanking = "ceadv";
  if (!configSettings.optionalRules.coverCalculation) configSettings.optionalRules.coverCalculation = "none";
  if (configSettings.optionalRules.displayBonusRolls === undefined) configSettings.optionalRules.displayBonusRolls = true;

  if (configSettings.optionalRules.checkFlanking === false) configSettings.optionalRules.checkFlanking = "off";
  if (configSettings.optionalRules.checkRange === true) configSettings.optionalRules.checkRange = "longfail";
  if (!configSettings.optionalRules.checkRange) configSettings.optionalRules.checkRange = "none";
  if (!configSettings.optionalRules.invisAdvantage) configSettings.optionalRules.invisAdvantage = "none";
  if (configSettings.optionalRules.invisAdvantage === true) configSettings.optionalRules.invisAdvantage = "RAW";
  if (!configSettings.optionalRules.hiddenAdvantage) configSettings.optionalRules.hiddenAdvantage = "none";
  if (configSettings.optionalRules.activeDefenceShowGM === true) {
    // old setting replaced with new
    configSettings.optionalRules.activeDefenceShow = "gmroll";
    delete configSettings.optionalRules.activeDefenceShowGM;
  }
  if (typeof configSettings.confirmAttackDamage !== "string") configSettings.confirmAttackDamage = "none";
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
    configSettings.itemTypeList.filter((type) => !["base", "backpack"].includes(type));
  }
  if (configSettings.itemTypeList === undefined) configSettings.itemTypeList = Object.keys(CONFIG.Item.typeLabels);
  if (configSettings.defaultSaveMultiplier === undefined) configSettings.defaultSaveMultiplier = 0.5;
  if (configSettings.ignoreSpellReactionRestriction === undefined) configSettings.ignoreSpellReactionRestriction = false;
  if (configSettings.damageImmunityMultiplier === undefined) configSettings.damageImmunityMultiplier = 0.0;
  if (configSettings.damageResistanceMultiplier === undefined) configSettings.damageResistanceMultiplier = 0.5;
  if (configSettings.damageVulnerabilityMultiplier === undefined) configSettings.damageVulnerabilityMultiplier = 2;
  if (configSettings.hidePlayerDamageCard === undefined) configSettings.hidePlayerDamageCard = true;
  if (configSettings.attackPerTarget === undefined) configSettings.attackPerTarget = false;
  if (configSettings.autoRemoveTemplate === undefined) configSettings.autoRemoveTemplate = true;
  if (configSettings.autoRemoveInstantaneousTemplate === undefined) configSettings.autoRemoveInstantaneousTemplate = false;
  if (configSettings.removeConcentrationEffects === undefined) configSettings.removeConcentrationEffects = "effects";
  if (configSettings.doConcentrationCheck === undefined) configSettings.doConcentrationCheck = configSettings.removeConcentration ? "chat" : "none";
  if (configSettings.undoWorkflow === undefined) configSettings.undoWorkflow = false;
  if (configSettings.undoChatColor === undefined) configSettings.undoChatColor = "Delete";
  if (configSettings.enforceSingleWeaponTarget == undefined) configSettings.enforceSingleWeaponTarget = false;
  if (configSettings.confirmAmmunition === undefined) configSettings.confirmAmmunition = false;
  if (configSettings.gmConfirmAmmunition === undefined) configSettings.gmConfirmAmmunition = false;
  if (configSettings.playerRollSaves === "noneDialog") configSettings.playerRollSaves = "noneDialogPrivate";
  configSettings.hidePlayerDamageCard = true;
  configSettings.quickSettings = true;
  //@ts-expect-error have removed the definition
  if (configSettings.averageNPCDamage !== undefined) {
    //@ts-expect-error delete the obsolete setting;
    delete configSettings.averageNPCDamage;
  }
  if (configSettings.averageDamage === undefined) configSettings.averageDamage = "none";
  //@ts-expect-error
  enableWorkflow = Boolean(game.settings?.get("midi-qol", "EnableWorkflow"));
  if (configSettings.optionalRules.challengeModeArmor === true) { // old settings
    if (configSettings.optionalRules.challengeModeArmorScale)
      configSettings.optionalRules.challengeModeArmor = "scale";
    else
      configSettings.optionalRules.challengeModeArmor = "challenge";
  } else if ([false, undefined].includes(configSettings.optionalRules.challengeModeArmor)) {
    configSettings.optionalRules.challengeModeArmor = "none"
  }

  if (configSettings.midiWoundedCondition === undefined) {
    configSettings.midiWoundedCondition = "none";
    configSettings.addWoundedStyle = "none";
  }
  if (configSettings.midiDeadCondition === undefined) configSettings.midiDeadCondition = "none";
  if (configSettings.midiUnconsciousCondition === undefined) configSettings.midiUnconsciousCondition = "none";
  // Fix for typo in en.json
  // should those be deleted entirely?
  if (configSettings.autoTarget === "wallsBlockIgnoreIncapcitated") configSettings.autoTarget = "wallsBlockIgnoreIncapacitated";
  if (configSettings.autoTarget === "wallsBlockIgnoreIncapacitated") configSettings.autoTarget = "wallsBlockIgnoreIncapacitated";
  if (configSettings.autoTarget === "alwaysIgnoreIncapcitated") configSettings.autoTarget = "alwaysIgnoreIncapacitated";
  //configSettings.v3DamageApplication = true;
  configSettings.useDamageDetail = false;
  if (configSettings.collapsibleTargets === undefined) configSettings.collapsibleTargets = true;
  //@ts-expect-error
  criticalDamage = String(game.settings?.get("midi-qol", "CriticalDamage"));
  if (criticalDamage === "none") criticalDamage = "default";
  //@ts-expect-error
  criticalDamageGM = String(game.settings?.get("midi-qol", "CriticalDamageGM"));
  if (criticalDamageGM === "none") criticalDamageGM = criticalDamage;
  //@ts-expect-error
  nsaFlag = Boolean(game.settings?.get("midi-qol", "showGM"));
  //@ts-expect-error
  coloredBorders = String(game.settings?.get("midi-qol", "ColoredBorders"));
  itemRollButtons = false; // Boolean(game.settings?.get("midi-qol", "ItemRollButtons"));
  //@ts-expect-error
  addChatDamageButtonsOld = String(game.settings?.get("midi-qol", "AddChatDamageButtons"));
  if (configSettings.addChatDamageButtons === undefined) configSettings.addChatDamageButtons = addChatDamageButtonsOld ?? "none";

  //@ts-expect-error
  autoFastForwardAbilityRolls = Boolean(game.settings?.get("midi-qol", "AutoFastForwardAbilityRolls"));
  //@ts-expect-error
  autoRemoveTargets = String(game.settings?.get("midi-qol", "AutoRemoveTargets"));
  if (autoRemoveTargets === "allGM") {
    autoRemoveTargets = game.user?.isGM ? "all" : "dead";
  }
  //@ts-expect-error
  let debugText: string = String(game.settings?.get("midi-qol", "Debug"));
  //@ts-expect-error
  forceHideRoll = Boolean(game.settings?.get("midi-qol", "ForceHideRoll"));
  //@ts-expect-error
  dragDropTargeting = Boolean(game.settings?.get("midi-qol", "DragDropTarget"));
  //@ts-expect-error
  DebounceInterval = Number(game.settings?.get("midi-qol", "DebounceInterval"));
  //@ts-expect-error
  ReplaceDefaultActivities = Boolean(game.settings?.get("midi-qol", "ReplaceDefaultActivities"));
  _debouncedUpdateAction = foundry.utils.debounce(_updateAction, DebounceInterval);
  const oldWeakReferences = UseWeakReferences;
  //@ts-expect-error
  UseWeakReferences = game.settings?.get("midi-qol", "UseWeakReferences") ?? false;
  if (UseWeakReferences !== oldWeakReferences) Workflow.clearWorkflows();
  //@ts-expect-error
  SaveToChatCard = game.settings?.get("midi-qol", "SaveToChatCard");
  //@ts-expect-error
  targetConfirmation = game.settings?.get("midi-qol", "TargetConfirmation");
  if (configSettings.griddedGridless === undefined) configSettings.griddedGridless = false;
  if (configSettings.gridlessFudge === undefined) configSettings.gridlessFudge = 0;
  if (configSettings.concentrationIncapacitatedConditionCheck === undefined) configSettings.concentrationIncapacitatedConditionCheck = false;
  if (configSettings.activationAutomation === undefined) configSettings.activationAutomation = "chat";
  if (configSettings.activityNamePrefix === undefined) configSettings.activityNamePrefix = true;
  if (blfxActive && configSettings.activityNamePrefix) {
    TroubleShooter.recordError({}, "Boss Loot FX is active - disabling activity name prefix");
    console.warn("midiqol | Boss Loot FX is active - disabling activity name prefix");
    configSettings.activityNamePrefix = false;
  }
  if (targetConfirmation === undefined || typeof targetConfirmation === "string" || targetConfirmation instanceof String) targetConfirmation = {
    enabled: false,
    always: false,
    noneTargeted: false,
    hasAttack: false,
    hasCreatureTarget: false,
    targetSelf: false,
    hasAoE: false,
    hasRangedAoE: false,
    longRange: false,
    inCover: false,
    allies: false,
    mixedDisposition: false,
    gridPosition: { x: 0, y: 0 }
  };

  setDebugLevel(debugText);

  if (configSettings.concentrationAutomation && game.user === game.users?.activeGM) {
    Hooks.once("ready", () => {
      if (configSettings.concentrationAutomation) {
        ui.notifications?.warn(`Midi concentration automation is deprecated in favour of ${game.system?.title} concentration checking - settings updated to use ${game.system?.id} concentration`, { permanent: true })
      };
      configSettings.concentrationAutomation = false;
      //@ts-expect-error
      game.settings?.set(game.system?.id, "disableConcentration", false);
      //@ts-expect-error
      game.settings?.set("midi-qol", "ConfigSettings", configSettings)
    });
  }
  //@ts-expect-error
  Hooks.callAll("midi-qol.ConfigSettingsChanged");
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
    name: "PreferredGM",
    scope: "world",
    default: "none",
    config: true,
    type: String,
  },
  {
    name: "ReplaceDefaultActivities",
    scope: "world",
    default: true,
    config: true,
    type: Boolean,
    requiresReload: true,
  },
  {
    name: "AutoFastForwardAbilityRolls",
    scope: "world",
    default: false,
    type: Boolean,
    config: true,
    onChange: fetchParams
  },
  /*
  {
    name: "ItemRollButtons",
    scope: "world",
    default: true,
    type: Boolean,
    onChange: fetchParams
  },
  */
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
    config: true,
    onChange: fetchParams, requiresReload: true
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
  },
  {
    name: "LateTargeting",
    scope: "client",
    default: "none",
    type: String,
    config: false,
    choices: "LateTargetingOptions",
  },
];

export function readySettingsSetup() {
    //@ts-expect-error
    game.settings?.register("midi-qol", "PreferredGM", {
      name: "midi-qol.PreferredGM.Name",
      hint: "midi-qol.PreferredGM.Hint",
      scope: "world",
      default: "none",
      config: true,
      type: String,
      choices: game.users?.filter(user => user.isGM).reduce((acc, user) => {
        acc[user.id] = user.name;
        return acc;
      }, { "": i18n("None") }),
    });
  //@ts-expect-error
  if (game.settings?.get("midi-qol", "CriticalDamage") === "none") {
    criticalDamage = "default;"
    //@ts-expect-error
    game.settings?.set("midi-qol", "CriticalDamage", "default");
  }
  //@ts-expect-error
  if (game.settings?.get("midi-qol", "CriticalDamageGM") === "none") {
    criticalDamageGM = criticalDamage;
    //@ts-expect-error
    game.settings?.set("midi-qol", "CriticalDamageGM", criticalDamage);
  }
}

export function registerSetupSettings() {
  const translations = geti18nTranslations();

  //@ts-expect-error
  game.settings?.register("midi-qol", "CriticalDamageGM", {
    name: "midi-qol.CriticalDamageGM.Name",
    // hint: "midi-qol.CriticalDamageGM.Hint",
    scope: "world",
    default: "none",
    type: String,
    config: true,
    choices: geti18nOptions("CriticalDamageChoices"),
    onChange: fetchParams
  });

  //@ts-expect-error
  game.settings?.register("midi-qol", "CriticalDamage", {
    name: "midi-qol.CriticalDamage.Name",
    hint: "midi-qol.CriticalDamage.Hint",
    scope: "world",
    default: "default",
    type: String,
    config: true,
    choices: geti18nOptions("CriticalDamageChoices"),
    onChange: fetchParams
  });
}

export const registerSettings = function () {
  const translations = geti18nTranslations();
  // Register any custom module settings here
  settings.forEach((setting, i) => {
    let MODULE = "midi-qol"
    let options = {
      name: i18n(`${MODULE}.${setting.name}.Name`),
      hint: i18n(`${MODULE}.${setting.name}.Hint`),
      scope: setting.scope,
      config: (setting.config === undefined) ? true : setting.config,
      default: setting.default,
      type: setting.type,
      choices: (typeof setting.choices === "string") ? geti18nOptions(`${setting.choices}`) : {},
      onChange: setting.onChange,
      requiresReload: setting.requiresReload
    };
    //@ts-ignore - too tedious to define undefined in each of the settings defs
    if (setting.choices) options.choices = setting.choices;
    //@ts-expect-error
    game.settings?.register("midi-qol", setting.name, options);
  });

  //@ts-expect-error
  game.settings?.register("midi-qol", "CriticalDamageGM", {
    name: "midi-qol.CriticalDamageGM.Name",
    // hint: "midi-qol.CriticalDamageGM.Hint",
    scope: "world",
    default: "none",
    type: String,
    config: true,
    choices: geti18nOptions("CriticalDamageChoices"),
    onChange: fetchParams
  });
  //@ts-expect-error
  game.settings?.register("midi-qol", "CriticalDamage", {
    name: "midi-qol.CriticalDamage.Name",
    hint: "midi-qol.CriticalDamage.Hint",
    scope: "world",
    default: "default",
    type: String,
    config: true,
    choices: geti18nOptions("CriticalDamageChoices"),
    onChange: fetchParams
  });

  //@ts-expect-error - remove this in v12.5.x??
  game.settings?.register("midi-qol", "AddChatDamageButtons", {
    name: "midi-qol.AddChatDamageButtons.Name",
    hint: "midi-qol.AddChatDamageButtons.Hint",
    scope: "world",
    default: "none",
    type: String,
    config: false,
    choices: geti18nOptions("AddChatDamageButtonsOptions"),
    onChange: fetchParams
  });

  //@ts-expect-error
  game.settings?.register("midi-qol", "ColoredBorders",
    {
      name: "midi-qol.ColoredBorders.Name",
      hint: "midi-qol.ColoredBorders.Hint",
      scope: "world",
      default: "None",
      type: String,
      config: true,
      choices: geti18nOptions("ColoredBordersOptions"),
      onChange: fetchParams
    });

  //@ts-expect-error
  game.settings?.register("midi-qol", "TargetConfirmation",
    {
      name: "midi-qol.TargetConfirmation.Name",
      hint: "midi-qol.TargetConfirmation.Hint",
      scope: "client",
      type: Object,
      default: defaultTargetConfirmationSettings,
      config: false,
      onChange: fetchParams
    });

  //@ts-expect-error
  game.settings?.register("midi-qol", "AutoRemoveTargets", {
    name: "midi-qol.AutoRemoveTargets.Name",
    hint: "midi-qol.AutoRemoveTargets.Hint",
    scope: "client",
    default: "dead",
    type: String,
    config: true,
    choices: geti18nOptions("AutoRemoveTargetsOptions"),
    onChange: fetchParams
  });
  game.settings?.registerMenu("midi-qol", "midi-qol", {
    name: i18n("midi-qol.config"),
    label: "midi-qol.WorkflowSettings",
    hint: i18n("midi-qol.Hint"),
    icon: "fas fa-dice-d20",
    type: ConfigPanel as any,
    restricted: true
  });

  game.settings?.registerMenu("midi-qol", "TargetConfirmationConfig", {
    name: i18n("midi-qol.TargetConfirmationConfig.Name"),
    label: i18n("midi-qol.TargetConfirmationConfig.Name"),
    hint: i18n("midi-qol.TargetConfirmationConfig.Hint"),
    icon: "fas fa-dice-d20",
    //@ts-expect-error
    type: TargetConfirmationConfig,
    restricted: false
  });

  game.settings?.registerMenu("midi-qol", "midi-qol-sounds", {
    name: i18n("midi-qol.SoundSettings.Name"),
    label: "midi-qol.SoundSettings.Label",
    hint: i18n("midi-qol.SoundSettings.Hint"),
    icon: "fas fa-dice-d20",
    type: SoundConfigPanel as any,
    restricted: true
  });

  //@ts-expect-error
  game.settings?.register("midi-qol", "playerControlsInvisibleTokens", {
    name: i18n("midi-qol.playerControlsInvisibleTokens.Name"),
    hint: i18n("midi-qol.playerControlsInvisibleTokens.Hint"),
    scope: "world",
    default: false,
    config: true,
    type: Boolean,
    requiresReload: true
  });

  //@ts-expect-error
  game.settings?.register("midi-qol", "DebounceInterval", {
    name: "Chat Message Cache Time (ms)",
    hint: "Chat message updates will only happen this often",
    scope: "world",
    default: 0,
    type: Number,
    config: true,
    onChange: fetchParams
  });

  //@ts-expect-error
  game.settings?.register("midi-qol", "Debug", {
    name: "midi-qol.Debug.Name",
    hint: "midi-qol.Debug.Hint",
    scope: "world",
    default: "None",
    type: String,
    config: true,
    choices: geti18nOptions("DebugOptions"),
    onChange: fetchParams
  });
  //@ts-expect-error
  game.settings?.register("midi-qol", "UseWeakReferences", {
    name: "Use Weak References for Workflows",
    hint: "Developer Only: Leave unchecked",
    scope: "world",
    default: false,
    type: Boolean,
    config: true,
    onChange: fetchParams
  });
  //@ts-expect-error
  game.settings?.register("midi-qol", "SaveToChatCard", {
    name: "Save to Chat Card",
    hint: "Developer Only: Leave unchecked",
    scope: "world",
    default: false,
    type: Boolean,
    config: true,
    onChange: fetchParams
  });

  //@ts-expect-error
  game.settings?.register("midi-qol", "notificationVersion", {
    name: "",
    hint: "",
    scope: "world",
    default: "0.0.0",
    type: String,
    config: false,
  });

  //@ts-expect-error
  game.settings?.register("midi-qol", "splashWarnings", {
    name: "",
    hint: "",
    scope: "world",
    type: Boolean,
    config: false,
    default: true
  })

  game.settings?.registerMenu("midi-qol", "troubleShooter", {
    name: i18n("midi-qol.TroubleShooter.Name"),
    label: "midi-qol.TroubleShooter.Label",
    icon: "fas fa-wrench",
    hint: i18n("midi-qol.TroubleShooter.Hint"),
    // icon: "fas fa-dice-d20",
    type: TroubleShooter as any,
    restricted: false
  });

  //@ts-expect-error
  game.settings?.register("midi-qol", "last-run-version", {
    type: String,
    config: false,
    default: "0.0.0",
    //@ts-ignore v10
    requiresReload: true
  });
  //@ts-expect-error
  game.settings?.register("midi-qol", "instanceId", {
    type: String,
    config: false,
    default: "",
    //@ts-ignore v10
    requiresReload: true
  });
}

export function disableWorkflowAutomation() {
  enableWorkflow = false;
}

export function safeGetGameSetting(moduleName: string, settingName: string): any | undefined {
  // @ts-expect-error
  if (game.settings?.settings.get(`${moduleName}.${settingName}`))
    //@ts-expect-error
    return game.settings?.get(moduleName, settingName);
  else return undefined;
}
