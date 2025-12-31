import { debug, setDebugLevel, i18n, debugEnabled, error, gameStats } from "../midi-qol.js";
import { ConfigPanel } from "./apps/ConfigPanel.js"
import { SoundConfigPanel } from "./apps/SoundConfigPanel.js";
import { TroubleShooter } from "./apps/TroubleShooter.js";
import { TargetConfirmationConfig } from "./apps/TargetConfirmationConfig.js";
import { Workflow } from "./Workflow.js";

export let autoFastForwardAbilityRolls: boolean;
export let autoRemoveTargets: string;
export let coloredBorders: string;
export let criticalDamage: string;
export let criticalDamageGM: string;
export let debounceInterval: number;
export let dragDropTargeting: boolean;
export let enableWorkflow: boolean;
export let forceHideRoll: boolean;
export let itemRollButtons: boolean;
export let midiSoundSettings: any = {};
export let midiSoundSettingsBackup: any = undefined;
export let nsaFlag: boolean;
export let playerControlsInvisibleTokens: boolean = false;
export let pruneChatLog: boolean = true;
export let replaceDefaultActivities: boolean = true;
export let saveRequests = {};
export let saveTimeouts = {};
export let saveToChatCard: boolean = false;
export let targetConfirmation: typeof defaultTargetConfirmationSettings;
export let useWeakReferences: boolean = false;

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
  allies: false,
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
  autoUndoTransformations: boolean = false;
  autoRemoveTemplate: boolean = true;
  autoRemoveInstantaneousTemplate: boolean = false;
  autoRollAttack: boolean = false;
  autoRollDamage: string = "none";
  autoCompleteWorkflow = false;
  saveDROrder = "DRSaveDr";
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
  gmAttackDamageCards: boolean = false;
  gmAutoAttack: boolean = false;
  gmAutoDamage: string = "none";
  gmAutoFastForwardAttack: boolean = false;
  gmAutoFastForwardDamage: boolean = false;
  gmConsumeResource: string = "none";
  gmDoReactions: string = "all";
  gmHide3dDice: boolean = false;
  gmRemoveButtons: string = "all";
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
  displayProperties: boolean = true;
  midiPropertiesTabRole: number = CONST.USER_ROLES.PLAYER;
  confirmAttackDamage: string = "none";
  highlightSuccess: boolean = true;
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
  savesBeforeDamage: boolean = false;
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
  useDamageDetail: boolean = true;
  waitForDamageApplication: boolean = false;
  weaponHitSound: string = "";
  weaponUseSound: string = "";
  weaponUseSoundRanged: string = "";
  rollAlternate: string = "off";
  optionalRules = {
    actionSpecialDurationImmediate: false,
    activeDefence: false,
    activeDefenceModifier: 12,
    activeDefenceShow: "selfroll",
    ActiveDefenceDC: true,
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

export let configSettings = new ConfigSettings();

export function checkMechanic(mechanic: keyof (typeof configSettings.optionalRules)) {
  if (configSettings.toggleOptionalRules) return false;
  return configSettings.optionalRules[mechanic];
}

export function checkRule(rule: keyof (typeof configSettings.optionalRules)) {
  let rulesEnabled = configSettings.optionalRulesEnabled;
  if (game.user?.isGM)
    rulesEnabled = rulesEnabled ? !configSettings.toggleOptionalRules : configSettings.toggleOptionalRules;
  return rulesEnabled && configSettings.optionalRules[rule];
}

export const checkedModuleList = [
  "about-time",
  "ActiveAuras",
  "auraeffects",
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
  "gambits-premades",
  "itemacro",
  /levels/,
  "lib-wrapper",
  "midi-item-showcase-community",
  "multilevel-tokens",
  "ready-set-roll-5e",
  "sequencer",
  "simbuls-cover-calculator",
  "socketlib",
  "times-up",
  "tokenmagic",
  "vision-5e",
  "walledtemplates",
  "warpgate",
  "wjmaia",
]

export const CheckedAuthorsList = [
  "hell",
  "dfreds",
  "theripper93",
  "ironmonk"
]

export function collectSettingData() {
  let data = {
    configSettings,
    midiSoundSettings,
    itemRollButtons,
    autoFastForwardAbilityRolls,
    autoRemoveTargets,
    coloredBorders,
    criticalDamage,
    criticalDamageGM,
    debounceInterval,
    dragDropTargeting,
    enableWorkflow,
    forceHideRoll,
    nsaFlag,
    saveToChatCard,
    playerControlsInvisibleTokens,
    pruneChatLog,
    replaceDefaultActivities,
    targetConfirmation,
    useWeakReferences,
    flags: {}
  };
  data.flags["exportSource"] = {
    system: game.system?.id,
    coreVersion: game.version ?? game.version,
    systemVersion: game.system.version,
    midiVersion: game.modules.get("midi-qol")?.version,
  };
  return data;
}
export function exportSettingsToJSON() {
  const filename = `fvtt-midi-qol-settings.json`;
  foundry.utils.saveDataToFile(JSON.stringify(collectSettingData(), null, 2), "text/json", filename);
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
  let requiresReload = false;
  if (typeof json === "string")
    json = JSON.parse(json);
  if (json.midiSettings) { // this is a trouble shooter file
    json = json.midiSettings;
  }

  await game.settings.set("midi-qol", "ConfigSettings", removeOldValues(json.configSettings));
  await game.settings.set("midi-qol", "MidiSoundSettings", removeOldValues(json.midiSoundSettings) ?? {});
  await game.settings.set("midi-qol", "TargetConfirmation", removeOldValues(json.targetConfirmation));

  // await game.settings.set("midi-qol", "AddChatDamageButtons", removeOldValues(json.addChatDamageButtons));
  // await game.settings.set("midi-qol", "ItemRollButtons", removeOldValues(json.itemRollButtons));
  await game.settings.set("midi-qol", "AutoFastForwardAbilityRolls", removeOldValues(json.autoFastForwardAbilityRolls));
  await game.settings.set("midi-qol", "AutoRemoveTargets", removeOldValues(json.autoRemoveTargets));
  await game.settings.set("midi-qol", "ColoredBorders", removeOldValues(json.coloredBorders));
  await game.settings.set("midi-qol", "CriticalDamage", removeOldValues(json.criticalDamage));
  await game.settings.set("midi-qol", "CriticalDamageGM", removeOldValues(json.criticalDamageGM));
  await game.settings.set("midi-qol", "DebounceInterval", removeOldValues(json.debounceInterval));
  await game.settings.set("midi-qol", "DragDropTarget", removeOldValues(json.dragDropTargeting));
  await game.settings.set("midi-qol", "EnableWorkflow", removeOldValues(json.enableWorkflow));
  if (json.forceHideRoll !== undefined) {
    if (game.settings.get("midi-qol", "ForceHideRoll") !== json.forceHideRoll) requiresReload = true;
    await game.settings.set("midi-qol", "ForceHideRoll", removeOldValues(json.forceHideRoll));
  }
  if (json.replaceDefaultActivities !== undefined) {
    if (game.settings.get("midi-qol", "ReplaceDefaultActivities") !== json.replaceDefaultActivities) requiresReload = true;
    await game.settings.set("midi-qol", "ReplaceDefaultActivities", removeOldValues(json.replaceDefaultActivities));
  }
  await game.settings.set("midi-qol", "SaveToChatCard", removeOldValues(json.saveToChatCard));
  await game.settings.set("midi-qol", "showGM", removeOldValues(json.nsaFlag));
  await game.settings.set("midi-qol", "UseWeakReferences", removeOldValues(json.useWeakReferences));
  if (json.playerControlsInvisibleTokens !== undefined) {
    if (game.settings.get("midi-qol", "playerControlsInvisibleTokens") !== json.playerControlsInvisibleTokens) requiresReload = true;
    await game.settings.set("midi-qol", "playerControlsInvisibleTokens", json.playerControlsInvisibleTokens);
  }
  if (json.pruneChatLog !== undefined) {
    if (game.settings.get("midi-qol", "pruneChatLog") !== json.pruneChatLog) requiresReload = true;
    await game.settings.set("midi-qol", "pruneChatLog", json.pruneChatLog);
  }

  const settingsAppId = game.settings.sheet?.id;
  if (settingsAppId) foundry.applications.instances.get(settingsAppId)?.render(true);
  const exportSource = json.flags?.exportSource;
  ui.notifications?.notify(`Importing settings from foundry version ${exportSource?.coreVersion} dnd ${exportSource?.systemVersion} midi ${exportSource?.midiVersion}`);
  if (requiresReload) {
  //@ts-expect-error
    foundry.applications.settings.SettingsConfig.reloadConfirm({ world: true });
  }
}
export let fetchSoundSettings = () => {
  midiSoundSettings = game.settings.get("midi-qol", "MidiSoundSettings") ?? {};
  if (midiSoundSettings.version === undefined) {
    midiSoundSettingsBackup = foundry.utils.duplicate(midiSoundSettings);
    midiSoundSettings = { "any": midiSoundSettings };
    midiSoundSettings.version = "0.9.48";
  }
}

export let fetchParams = () => {
  if (debugEnabled > 1) debug("Fetch Params Loading");
  const blfxActive = game.modules.get("boss-loot-assets-premium")?.active || game.modules.get("boss-loot-assets-free")?.active;

  configSettings = game.settings.get("midi-qol", "ConfigSettings");
  if (configSettings.saveDROrder === undefined) configSettings.saveDROrder = "DRSaveDr";
  if (!["DRSaveDr", "SaveDRDr", "SaveDrDR"].includes(configSettings.saveDROrder)) {
    ui.notifications?.warn("invalidSaveDROrder reset to 'dm.midi/dnd5e.dm -> Saves/(dr/dv/di) - dnd5e RAW'");
    configSettings.saveDROrder = "DRSaveDr";
  }
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
  //@ts-expect-error legacy boolean value
  if (configSettings.autoCEEffects === true) configSettings.autoCEEffects = "both";
  if (!configSettings.autoCEEffects) configSettings.autoCEEffects = "none";
  configSettings.toggleOptionalRules = false;
  if (configSettings.displaySaveAdvantage === undefined) configSettings.displaySaveAdvantage = true;
  if (!configSettings.recordAOO) configSettings.recordAOO = "none";
  if (!configSettings.enforceReactions) configSettings.enforceReactions = "none";
  if (!configSettings.enforceBonusActions) configSettings.enforceBonusActions = "none";
  //@ts-expect-error legacy boolean value
  if (configSettings.autoItemEffects === false) configSettings.autoItemEffects = "off";
  if (configSettings.playerDamageCard === undefined) configSettings.playerDamageCard = "none";
  if (configSettings.playerCardDamageDifferent === undefined) configSettings.playerCardDamageDifferent = true;
  if (configSettings.rollAlternate === undefined) configSettings.rollAlternate = "off";
  //@ts-expect-error legacy boolean value
  if (configSettings.rollAlternate === false) configSettings.rollAlternate = "off";
  //@ts-expect-error legacy boolean value
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
  if (configSettings.highlightSuccess === undefined) configSettings.highlightSuccess = true;
  if (configSettings.highLightCriticalAttackOnly === undefined) configSettings.highLightCriticalAttackOnly = false;
  configSettings.optionalRules = foundry.utils.mergeObject({ // eventually split this into mechanics and rules
    actionSpecialDurationImmediate: false,
    activeDefence: false,
    activeDefenceModifier: 12, // default value for active defence modifier
    activeDefenceShow: "selfroll",
    ActiveDefenceDC: true,
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
    displayProperties: true,
  }, configSettings.optionalRules ?? {}, { overwrite: true, insertKeys: true, insertValues: true });
  if (!configSettings.optionalRules.incapacitated) configSettings.optionalRules.incapacitated = "nothing";
  if (!configSettings.optionalRules.wallsBlockRange) configSettings.optionalRules.wallsBlockRange = "center";
  //@ts-expect-error legacy boolean value
  if (configSettings.optionalRules.checkFlanking === true) configSettings.optionalRules.checkFlanking = "ceadv";
  if (!configSettings.optionalRules.coverCalculation) configSettings.optionalRules.coverCalculation = "none";
  if (configSettings.optionalRules.displayBonusRolls === undefined) configSettings.optionalRules.displayBonusRolls = true;

  //@ts-expect-error legacy boolean value
  if (configSettings.optionalRules.checkFlanking === false) configSettings.optionalRules.checkFlanking = "off";
  //@ts-expect-error legacy boolean value
  if (configSettings.optionalRules.checkRange === true) configSettings.optionalRules.checkRange = "longfail";
  if (!configSettings.optionalRules.checkRange) configSettings.optionalRules.checkRange = "none";
  if (!configSettings.optionalRules.invisAdvantage) configSettings.optionalRules.invisAdvantage = "none";
  //@ts-expect-error legacy boolean value
  if (configSettings.optionalRules.invisAdvantage === true) configSettings.optionalRules.invisAdvantage = "RAW";
  if (!configSettings.optionalRules.hiddenAdvantage) configSettings.optionalRules.hiddenAdvantage = "none";
  //@ts-expect-error legacy nonexistent value
  if (configSettings.optionalRules.activeDefenceShowGM === true) {
    // old setting replaced with new
    configSettings.optionalRules.activeDefenceShow = "gmroll";
    //@ts-expect-error legacy nonexistent value
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
  enableWorkflow = game.settings.get("midi-qol", "EnableWorkflow");
  //@ts-expect-error legacy boolean value
  if (configSettings.optionalRules.challengeModeArmor === true) { // old settings
    //@ts-expect-error legacy value
    if (configSettings.optionalRules.challengeModeArmorScale)
      configSettings.optionalRules.challengeModeArmor = "scale";
    else
      configSettings.optionalRules.challengeModeArmor = "challenge";
  //@ts-expect-error legacy boolean value
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
  configSettings.useDamageDetail = true;
  if (configSettings.collapsibleTargets === undefined) configSettings.collapsibleTargets = true;
  if (configSettings.displayProperties === undefined) configSettings.displayProperties = true;
  criticalDamage = game.settings.get("midi-qol", "CriticalDamage");
  if (criticalDamage === "none") criticalDamage = "default";
  criticalDamageGM = game.settings.get("midi-qol", "CriticalDamageGM");
  if (criticalDamageGM === "none") criticalDamageGM = criticalDamage;
  nsaFlag = game.settings.get("midi-qol", "showGM");
  coloredBorders = game.settings.get("midi-qol", "ColoredBorders");
  itemRollButtons = false; // game.settings.get("midi-qol", "ItemRollButtons");
  if (configSettings.addChatDamageButtons === undefined) configSettings.addChatDamageButtons = "none";

  autoFastForwardAbilityRolls = game.settings.get("midi-qol", "AutoFastForwardAbilityRolls");
  autoRemoveTargets = game.settings.get("midi-qol", "AutoRemoveTargets");
  if (autoRemoveTargets === "allGM") {
    autoRemoveTargets = game.user?.isGM ? "all" : "dead";
  }
  let debugText: string = game.settings.get("midi-qol", "Debug");
  forceHideRoll = game.settings.get("midi-qol", "ForceHideRoll");
  dragDropTargeting = game.settings.get("midi-qol", "DragDropTarget");
  debounceInterval = game.settings.get("midi-qol", "DebounceInterval");
  replaceDefaultActivities = game.settings.get("midi-qol", "ReplaceDefaultActivities");
  const oldWeakReferences = useWeakReferences;
  useWeakReferences = game.settings.get("midi-qol", "UseWeakReferences") ?? false;
  if (useWeakReferences !== oldWeakReferences) Workflow.clearWorkflows();
  saveToChatCard = game.settings.get("midi-qol", "SaveToChatCard");
  pruneChatLog = game.settings.get("midi-qol", "pruneChatLog");
  targetConfirmation = game.settings.get("midi-qol", "TargetConfirmation");
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
      game.settings.set("dnd5e", "disableConcentration", false);
      game.settings.set("midi-qol", "ConfigSettings", configSettings)
    });
  }
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
    default: "",
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
  }
];

export function readySettingsSetup() {
  game.settings.register("midi-qol", "PreferredGM", {
    name: "midi-qol.PreferredGM.Name",
    hint: "midi-qol.PreferredGM.Hint",
    scope: "world",
    default: "",
    config: true,
    type: String,
    choices: game.users?.filter(user => user.isGM).reduce((acc, user) => {
      acc[user.id] = user.name;
      return acc;
    }, { "": i18n("None") }),
  });
  if (game.settings.get("midi-qol", "CriticalDamage") === "none") {
    criticalDamage = "default;"
    game.settings.set("midi-qol", "CriticalDamage", "default");
  }
  if (game.settings.get("midi-qol", "CriticalDamageGM") === "none") {
    criticalDamageGM = criticalDamage;
    game.settings.set("midi-qol", "CriticalDamageGM", criticalDamage);
  }
}

function keysToOptionsObj(prefix: string, keys: string[]) {
  return Object.fromEntries(keys.map(key => [key, `midi-qol.${prefix}.${key}`]));
}

export const criticalDamageChoices = keysToOptionsObj("CriticalDamageChoices", [
  "default",
  "maxDamage",
  "maxCrit",
  "maxCritRoll",
  "maxAll",
  "doubleDice",
  "explode",
  "maxDamageExplode",
  "explodeCharacter",
  "explodeNPC",
  "baseDamage",
  "maxBaseRollCrit",
  "bestOfTwo"
]);

export const addChatDamageButtonsOptions = keysToOptionsObj("AddChatDamageButtonsOptions", [
  "none",
  "gm",
  "pc",
  "both"
]);

export const coloredBordersOptions = keysToOptionsObj("ColoredBordersOptions", [
  "none",
  "borders",
  "borderNamesText",
  "borderNamesBackground"
]);

export const autoRemoveTargetsOptions = keysToOptionsObj("AutoRemoveTargetsOptions", [
  "none",
  "dead",
  "allGM",
  "all"
]);

export const debugOptions = keysToOptionsObj("DebugOptions", [
  "none",
  "warn",
  "debug",
  "all"
]);

export const autoRollDamageOptions = keysToOptionsObj("autoRollDamageOptions", [
  "none",
  "always",
  "saveOnly",
  "onHit"
]);

export const autoCheckHitOptions = keysToOptionsObj("autoCheckHitOptions", [
  "none",
  "all",
  "whisper",
  "gmOnly"
]);

export const clickOptions = keysToOptionsObj("clickOptions", [
  "off",
  "attack",
  "damage",
  "all"
]);

export const autoTargetOptions = keysToOptionsObj("autoTargetOptions", [
  "none",
  "always",
  "alwaysIgnoreIncapacitated",
  "alwaysIgnoreDefeated",
  "wallsBlock",
  "wallsBlockIgnoreIncapacitated",
  "wallsBlockIgnoreDefeated",
  "walledtemplates"
]);

export const autoCheckSavesOptions = keysToOptionsObj("autoCheckSavesOptions", [
  "none",
  "allNoRoll",
  "all",
  "allShow",
  "whisper",
  "gmOnly",
]);

export const rangeTargetOptions = keysToOptionsObj("rangeTargetOptions", [
  "none",
  "always",
  "alwaysIgnoreIncapacitated",
  "alwaysIgnoreDefeated",
  "wallsBlock",
  "wallsBlockIgnoreIncapacitated",
  "wallsBlockIgnoreDefeated"
]);

export const autoApplyDamageOptions = keysToOptionsObj("autoApplyDamageOptions", [
  "none",
  "noCard",
  "noCardMisses",
  "yes",
  "yesCard",
  "yesCardMisses",
  "yesCardNPC"
]);

export const playerDamageCardOptions = keysToOptionsObj("playerDamageCardOptions", [
  "none",
  "playerresults",
  "playerbuttons",
  "npcplayerresults",
  "npcplayerbuttons"
]);

export const removeButtonsOptions = keysToOptionsObj("removeButtonsOptions", [
  "off",
  "attack",
  "damage",
  "all",
  "everything"
]);

export const damageImmunitiesOptions = keysToOptionsObj("damageImmunitiesOptions", [
  "none",
  "immunityDefault",
  "immunityPhysical"
]);

export const showItemDetailsOptions = keysToOptionsObj("showItemDetailsOptions", [
  "none",
  "cardOnly",
  "pc",
  "all"
]);

export const rollNPCSavesOptions = keysToOptionsObj("rollNPCSavesOptions", [
  "none",
  "auto",
  "autoDialog",
  "mtb",
  "ftb",
  "rer"
]);

export const playerRollSavesOptions = keysToOptionsObj("playerRollSavesOptions", [
  "none",
  "nonePublic",
  "noneDialogPublic",
  "noneDialogPrivate",
  "noneDialogSelf",
  "noneDialogBlind",
  "chat",
  "mtb",
  "ftb",
  "rer"
]);

export const playerRollSavesOptionsReduced = keysToOptionsObj("playerRollSavesOptionsReduced", [
  "none",
  "chat"
]);

export const hideRollDetailsOptions = keysToOptionsObj("hideRollDetailsOptions", [
  "none",
  "detailsDSN",
  "details",
  "d20Only",
  "hitDamage",
  "hitCriticalDamage",
  "attackTotalOnly",
  "d20AttackOnly",
  "all"
]);

export const rollOtherDamageOptions = keysToOptionsObj("RollOtherDamageOptions", [
  "none",
  "always",
  "condition",
  "ifSave"
]);

export const showReactionAttackRollOptions = keysToOptionsObj("ShowReactionAttackRollOptions", [
  "none",
  "d20",
  "all",
  "allCrit"
]);

export const onUseMacroOptions = keysToOptionsObj("onUseMacroOptions", [
  "preTargeting",
  "preItemRoll",
  "templatePlaced",
  "preAttackRoll",
  "preAttackRollConfig",
  "preCheckHits",
  "postAttackRoll",
  "preDamageRoll",
  "postDamageRoll",
  "damageBonus",
  "preSave",
  "postSave",
  "preDamageRollConfig",
  "preDamageApplication",
  "preActiveEffects",
  "postActiveEffects",
  "isTargeted",
  "isPreAttacked",
  "isAttacked",
  "isHit",
  "preTargetSave",
  "isSave",
  "isSaveSuccess",
  "isSaveFailure",
  "preTargetDamageApplication",
  "postTargetEffectApplication",
  "isDamaged",
  "all"
]);

export const confirmTargetOptions = keysToOptionsObj("ConfirmTargetOptions", [
  "default",
  "always",
  "never"
]);

export const triggeredActivityTargetOptions = keysToOptionsObj("TriggeredActivityTargetOptions", [
  "self",
  "targets",
  "hitTargets",
  "missedTargets",
  "failedSaves",
  "saveTargets",
  "retarget"
]);

export const triggeredActivityRollAsOptions = keysToOptionsObj("TriggeredActivityRollAsOptions", [
  "self",
  "firstTarget",
  "firstHitTarget",
  "firstMissedTarget",
  "firstSaveTarget",
  "firstFailedSaveTarget"
]);

// Base ignore traits options (apply to all damage types)
export const ignoreTraitsOptionsBase = {
  idi: {
    label: "midi-qol.SHARED.FIELDS.midiProperties.ignoreTraits.idi.label",
    hint: "midi-qol.SHARED.FIELDS.midiProperties.ignoreTraits.idi.hint"
  },
  idr: {
    label: "midi-qol.SHARED.FIELDS.midiProperties.ignoreTraits.idr.label",
    hint: "midi-qol.SHARED.FIELDS.midiProperties.ignoreTraits.idr.hint"
  },
  idv: {
    label: "midi-qol.SHARED.FIELDS.midiProperties.ignoreTraits.idv.label",
    hint: "midi-qol.SHARED.FIELDS.midiProperties.ignoreTraits.idv.hint"
  },
  ida: {
    label: "midi-qol.SHARED.FIELDS.midiProperties.ignoreTraits.ida.label",
    hint: "midi-qol.SHARED.FIELDS.midiProperties.ignoreTraits.ida.hint"
  },
  idm: {
    label: "midi-qol.SHARED.FIELDS.midiProperties.ignoreTraits.idm.label",
    hint: "midi-qol.SHARED.FIELDS.midiProperties.ignoreTraits.idm.hint"
  }
};

// For backwards compatibility
export const ignoreTraitsOptions = ignoreTraitsOptionsBase;

// Category labels for damage-type specific options
export const ignoreTraitsCategoryLabels = {
  idi: "midi-qol.SHARED.FIELDS.midiProperties.ignoreTraits.idi.short",
  idr: "midi-qol.SHARED.FIELDS.midiProperties.ignoreTraits.idr.short",
  idv: "midi-qol.SHARED.FIELDS.midiProperties.ignoreTraits.idv.short",
  ida: "midi-qol.SHARED.FIELDS.midiProperties.ignoreTraits.ida.short",
  idm: "midi-qol.SHARED.FIELDS.midiProperties.ignoreTraits.idm.short"
};

/**
 * Get ignore traits options including damage-type specific options.
 * Returns options in format: { value, label, group? }
 * Values are either "idi" (all) or "idi.fire" (specific damage type)
 */
export function getIgnoreTraitsOptions(): { value: string, label: string, group?: string }[] {
  const options: { value: string, label: string, group?: string }[] = [];
  const damageTypes = CONFIG.DND5E?.damageTypes ?? {};

  // Add base "all" options first
  for (const [key, entry] of Object.entries(ignoreTraitsOptionsBase)) {
    options.push({
      value: key,
      label: i18n(entry.label),
      group: i18n("midi-qol.SHARED.FIELDS.midiProperties.ignoreTraits.allTypes")
    });
  }

  // Add damage-type specific options for each category
  for (const [category, categoryEntry] of Object.entries(ignoreTraitsOptionsBase)) {
    const categoryLabel = i18n(ignoreTraitsCategoryLabels[category] ?? categoryEntry.label);
    for (const [dt, dtConfig] of Object.entries(damageTypes)) {
      const dtLabel = (dtConfig as any).label ?? dt;
      options.push({
        value: `${category}.${dt}`,
        label: `${categoryLabel}: ${dtLabel}`,
        group: categoryLabel
      });
    }
  }

  return options;
}

export const aoeTargetTypeOptions = keysToOptionsObj("AoETargetTypeOptions", [
  "any",
  "ally",
  "notAlly",
  "enemy",
  "notEnemy",
  "neutral",
  "notNeutral",
  "hostile",
  "notHostile",
  "Friendly", //grr
  "notFriendly"
]);

export const autoCEEffectsOptions = keysToOptionsObj("AutoCEEffectsOptions", [
  "none",
  "itempri",
  "cepri",
  "both"
]);

export const wallsBlockRangeOptionsNew = keysToOptionsObj("WallsBlockRangeOptionsNew", [
  "none",
  "center",
  "centerLevels",
  "levelsautocover",
  "simbuls-cover-calculator",
  "tokencover",
  "tokenvisibility"
]);

export const coverCalculationOptions = keysToOptionsObj("CoverCalculationOptions", [
  "none",
  "simbuls-cover-calculator",
  "simplecover5e",
  "levelsautocover",
  "tokencover",
  "tokenvisibility"
]);

export const hiddenAdvantageOptions = keysToOptionsObj("HiddenAdvantageOptions", [
  "none",
  "effect",
  "perceptive"
]);

export const addDeadOptions = keysToOptionsObj("AddDeadOptions", [
  "none",
  "overlay",
  "normal"
]);

export const quickSettingsBlurb = keysToOptionsObj("QuickSettingsBlurb", [
  "1",
  "2",
  "3",
  "4"
]);

export const requiresTargetsOptions = keysToOptionsObj("requiresTargetsOptions", [
  "none",
  "combat",
  "tokens",
  "always"
]);

export const doReactionsOptions = keysToOptionsObj("DoReactionsOptions", [
  "all",
  "allMI",
  "none"
]);

export const gmDoReactionsOptions = keysToOptionsObj("GMDoReactionsOptions", [
  "all",
  "allMI",
  "none"
]);

export const recordAOOOptions = keysToOptionsObj("RecordAOOOptions", [
  "none",
  "character",
  "all"
]);

export const EnforceReactionsOptions = keysToOptionsObj("EnforceReactionsOptions", [
  "none",
  "displayOnly",
  "character",
  "all"
]);

export const autoEffectsOptions = keysToOptionsObj("AutoEffectsOptions", [
  "off",
  "applyNoButton",
  "applyRemove",
  "applyLeave"
]);

export const requireMagicalOptions = keysToOptionsObj("RequireMagicalOptions", [
  "off",
  "nonspell",
  "allitems"
]);

export const checkFlankingOptions = keysToOptionsObj("CheckFlankingOptions", [
  "off",
  "advonly",
  "ceonly",
  "midiFlanking",
  "ceflanked",
  "midiFlanked",
  "ceflankedNoconga",
  "midiFlankedNoConga"
]);

export const hideRollDetailsHintLongOptions = keysToOptionsObj("HideRollDetails.HintLong", [
  "none",
  "detailsDSN",
  "details",
  "d20Only",
  "hitDamage",
  "d20attackOnly",
  "all"
]);

export const rollAlternateOptions = keysToOptionsObj("RollAlternateOptions", [
  "off",
  "formula",
  "adv",
  "formulaadv"
]);

export const consumeResourceOptions = keysToOptionsObj("ConsumeResourceOptions", [
  "none",
  "spell",
  "item",
  "both"
]);

export const averageDamageOptions = keysToOptionsObj("AverageDamageOptions", [
  "none",
  "npc",
  "character",
  "all"
]);

export const removeConcentrationEffectsOptions = keysToOptionsObj("RemoveConcentrationEffectsOptions", [
  "none",
  "effects",
  "effectsTemplates"
]);

export const incapacitatedOptions = keysToOptionsObj("IncapacitatedOptions", [
  "nothing",
  "enforce",
  "warn"
]);

export const checkRangeOptions = keysToOptionsObj("CheckRangeOptions", [
  "none",
  "longfail",
  "longdisadv"
]);

export const invisAdvantageOptions = keysToOptionsObj("InvisAdvantageOptions", [
  "none",
  "RAW",
  "vision"
]);

export const confirmAttackDamageOptions = keysToOptionsObj("ConfirmAttackDamageOptions", [
  "none",
  "gmOnly",
  "GMPlayer"
]);

export const challengeModeArmorOptions = keysToOptionsObj("ChallengeModeArmorOptions", [
  "none",
  "challenge",
  "scale",
  "scaleNoAR"
]);

export const saveDROrderOptions = keysToOptionsObj("SaveDROrderOptions", [
  "DRSaveDr",
  "SaveDRDr",
  "SaveDrDR"
]);

export const doConcentrationCheckOptions = keysToOptionsObj("DoConcentrationCheckOptions", [
  "none",
  "chatOnly",
  "chat",
  "item"
]);

export const activationAutomationOptions = keysToOptionsObj("ActivationAutomationOptions", [
  "none",
  "chat",
  "auto"
]);

export const soundSettingsBlurb = keysToOptionsObj("SoundSettingsBlurb", [
  "1",
  "2",
  "3",
  "4"
]);

export const rollConfigOptions = keysToOptionsObj("ConfigDialogOptions", [
  "default",
  "always",
  "never"
]);
export const damageConfigOptions = keysToOptionsObj("ConfigDialogOptions", [
  "default",
  "always",
  "never"
]);
export const consumeConfigOptions = keysToOptionsObj("ConfigDialogOptions", [
  "default",
  "always",
  "never"
]);

export const registerSettings = function () {

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
      choices: {},
      onChange: setting.onChange,
      requiresReload: setting.requiresReload
    };
    if (setting.choices) options.choices = setting.choices;
    // @ts-expect-error
    game.settings.register("midi-qol", setting.name, options);
  });

  game.settings.register("midi-qol", "RollStats", {
    scope: "world",
    default: {},
    type: Object,
    config: false,
    onChange: () => {
      gameStats.fetchStats();
      Hooks.callAll("midi-qol.StatsUpdated");
    }
  });
  
  game.settings.register("midi-qol", "CriticalDamageGM", {
    name: "midi-qol.CriticalDamageGM.Name",
    // hint: "midi-qol.CriticalDamageGM.Hint",
    scope: "world",
    default: "none",
    type: String,
    config: true,
    choices: criticalDamageChoices,
    onChange: fetchParams
  });
  game.settings.register("midi-qol", "CriticalDamage", {
    name: "midi-qol.CriticalDamage.Name",
    hint: "midi-qol.CriticalDamage.Hint",
    scope: "world",
    default: "default",
    type: String,
    config: true,
    choices: criticalDamageChoices,
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
      choices: coloredBordersOptions,
      onChange: fetchParams
    });

  game.settings.register("midi-qol", "TargetConfirmation",
    {
      name: "midi-qol.TargetConfirmation.Name",
      hint: "midi-qol.TargetConfirmation.Hint",
      scope: "client",
      type: Object,
      default: defaultTargetConfirmationSettings,
      config: false,
      onChange: fetchParams
    });

  game.settings.register("midi-qol", "AutoRemoveTargets", {
    name: "midi-qol.AutoRemoveTargets.Name",
    hint: "midi-qol.AutoRemoveTargets.Hint",
    scope: "client",
    default: "dead",
    type: String,
    config: true,
    choices: autoRemoveTargetsOptions,
    onChange: fetchParams
  });
  game.settings.registerMenu("midi-qol", "midi-qol", {
    name: i18n("midi-qol.config"),
    label: "midi-qol.WorkflowSettings",
    hint: i18n("midi-qol.Hint"),
    icon: "fas fa-dice-d20",
    type: ConfigPanel as any,
    restricted: true
  });

  game.settings.registerMenu("midi-qol", "TargetConfirmationConfig", {
    name: i18n("midi-qol.TargetConfirmationConfig.Name"),
    label: i18n("midi-qol.TargetConfirmationConfig.Name"),
    hint: i18n("midi-qol.TargetConfirmationConfig.Hint"),
    icon: "fas fa-dice-d20",
    type: TargetConfirmationConfig,
    restricted: false
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
    name: i18n("midi-qol.playerControlsInvisibleTokens.Name"),
    hint: i18n("midi-qol.playerControlsInvisibleTokens.Hint"),
    scope: "world",
    default: false,
    config: true,
    type: Boolean,
    requiresReload: true
  });

  game.settings.register("midi-qol", "pruneChatLog", {
    name: "Prune Chat Log",
    hint: "Automatically prune chat messages to limit those in memory.",
    scope: "world",
    default: true,
    type: Boolean,
    config: true,
    requiresReload: true
  });

  game.settings.register("midi-qol", "DebounceInterval", {
    name: "Chat Message Cache Time (ms)",
    hint: "Chat message updates will only happen this often",
    scope: "world",
    default: 0,
    type: Number,
    config: true,
    onChange: () => {debounceInterval = game.settings.get("midi-qol", "DebounceInterval");}
  });

  game.settings.register("midi-qol", "Debug", {
    name: "midi-qol.Debug.Name",
    hint: "midi-qol.Debug.Hint",
    scope: "world",
    default: "None",
    type: String,
    config: true,
    choices: debugOptions,
    onChange: fetchParams
  });
  game.settings.register("midi-qol", "SaveToChatCard", {
    name: "Save to Chat Card",
    hint: "save the workflow state to the chat card - so that it can be restored on reload",
    scope: "world",
    default: false,
    type: Boolean,
    config: true,
    onChange: fetchParams
  });
  game.settings.register("midi-qol", "UseWeakReferences", {
    name: "Use Weak References for Workflows",
    hint: "Only enable if Save to Chat Card is enabled. This will use WeakReferences to store workflows - should save some memory.",
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

  game.settings.registerMenu("midi-qol", "troubleShooter", {
    name: i18n("midi-qol.TroubleShooter.Name"),
    label: "midi-qol.TroubleShooter.Label",
    icon: "fas fa-wrench",
    hint: i18n("midi-qol.TroubleShooter.Hint"),
    // icon: "fas fa-dice-d20",
    type: TroubleShooter,
    restricted: false
  });

  game.settings.register("midi-qol", "last-run-version", {
    type: String,
    config: false,
    default: "0.0.0",
    requiresReload: true
  });
  game.settings.register("midi-qol", "instanceId", {
    type: String,
    config: false,
    default: "",
    requiresReload: true
  });
}

export function disableWorkflowAutomation() {
  enableWorkflow = false;
}

export function safeGetGameSetting(moduleName: string, settingName: string): any | undefined {
  // @ts-expect-error
  if (game.settings.settings.get(`${moduleName}.${settingName}`))
    //@ts-expect-error
    return game.settings.get(moduleName, settingName);
  else return undefined;
}
