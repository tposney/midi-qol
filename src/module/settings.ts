import { registerHiddenGroundCueSetting } from "./lib/hiddenGroundCue.js";
import { applyChatCardSummaries, registerChatCardSummariesSetting } from "./lib/chatCardSummaries.js";
import { registerRulesTextSettings } from "./lib/rulesText.js";
import { debug, setDebugLevel, i18n, debugEnabled, gameStats, updateFlankingStatusEffects } from "../midi-qol.js";
import { ConfigPanel } from "./apps/ConfigPanel.js"
import { DependentsExplorer } from "./apps/DependentsExplorer.js";
import { ModuleReviewDialog } from "./apps/ModuleReviewDialog.js";
import { RollStatsDisplay } from "./apps/RollStatsDisplay.js";
import { SoundConfigPanel } from "./apps/SoundConfigPanel.js";
import { TroubleShooter } from "./apps/TroubleShooter.js";
import { TargetConfirmationConfig } from "./apps/TargetConfirmationConfig.js";
import { Workflow } from "./Workflow.js";
import type { SelectOptions } from "../globals.js";

// Dummy FormApplication that launches the setup wizard via hook (can't be eliminated - fires a hook, not an app)
class LaunchWizardSubmenu extends FormApplication {
  constructor(object = {}, options = {}) {
    super(object, options);
  }
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "midi-qol-launch-wizard",
      classes: ["midi-qol"],
      title: "Launch Setup Wizard",
      width: 0,
      height: 0
    });
  }
  async _render(force?: boolean, options?: any) {
    // Don't render anything - just trigger the wizard and close
    Hooks.call("midi-qol-setup-wizard.launch");
    this.close();
  }
  getData() { return {}; }
  protected _updateObject(event: Event, formData?: object): Promise<unknown> { return Promise.resolve(); }
}

// Dummy FormApplication that shows reset confirmation dialog
class ResetSettingsSubmenu extends FormApplication {
  constructor(object = {}, options = {}) {
    super(object, options);
  }
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "midi-qol-reset-settings",
      classes: ["midi-qol"],
      title: "Reset Settings",
      width: 0,
      height: 0
    });
  }
  async _render(force?: boolean, options?: any) {
    // Don't render anything - show confirmation dialog and close
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: i18n("midi-qol.ResetDefaults.Title") },
      content: `<p>${i18n("midi-qol.ResetDefaults.Content")}</p>`,
      yes: { label: i18n("midi-qol.ResetDefaults.Confirm") },
      no: { label: i18n("Cancel") }
    });
    if (confirmed) {
      await resetConfigSettingsToDefaults();
    }
    this.close();
  }
  getData() { return {}; }
  protected _updateObject(event: Event, formData?: object): Promise<unknown> { return Promise.resolve(); }
}

let fastForwardMigrationDone = false;
/** @deprecated Removed in favor of granular configSettings.autoFastForward[] and configSettings.gmAutoFastForward[] arrays */
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
export let replaceDefaultActivities: boolean = true;
export let saveRequests = {};
export let saveTimeouts = {};
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

class ConfigSettings {
  // fullAuto: boolean = false;
  addDead: string = "none";
  addFakeDice: boolean = false;
  addWounded: number = 0;
  addWoundedStyle: string = "none";
  activityNamePrefix: boolean = true;
  conditionEditorEnabled: boolean = true;
  rulesTextFill: boolean = true;
  activationAutomation: string = "chat";
  midiWoundedCondition: string = "none";
  midiDeadCondition: string = "none";
  midiUnconsciousCondition: string = "none";
  allowUseMacro: boolean = true;
  allowActorUseMacro: boolean = true;
  attackPerTarget: boolean = false;
  autoApplyDamage: string = "none";
  playerDamageCard: string = "none";
  playerCardDamageDifferent: boolean = false;
  autoCEEffects: string = "none";
  autoCheckHit: string = "none";
  autoCheckSaves: string = "none";
  saveSummaryStyle: string = "midi";
  chatCardSummaries: string = "client";
  autoFastForward: string[] = [];
  autoItemEffects: string = "off";
  autoRemoveSummonedCreature: boolean = false;
  autoUndoTransformations: boolean = false;
  autoRemoveTemplate: boolean = true;
  autoRemoveInstantaneousTemplate: boolean = false;
  constrainTemplatePlacement: boolean = false;
  templateSnapping: string = "full";
  autoRollAttack: boolean = false;
  autoRollDamage: string = "none";
  autoCompleteWorkflow = true;
  saveDROrder = "DRSaveDr";
  autoTarget: string = "none";
  defaultOtherActivity: string = "auto";
  averageDamage: string = "none";
  checkTwoHanded: boolean = false;
  collapsibleTargets: boolean = false;
  coloredBorders: string = "none";
  concentrationAutomation: boolean = false;
  confirmAmmunition: boolean = false;
  gmConfirmAmmunition: boolean = false;
  consumeResource: string = "none";
  criticalDamage: string = "default";
  criticalDamageGM: string = "default";
  customSoundsPlaylist: string = "none";
  damageImmunities: string = "none";
  damageImmunityMultiplier: number = 0.0;
  damageResistanceMultiplier: number = 0.5;
  damageVulnerabilityMultiplier: number = 2;
  defaultSaveMult: number = 0.5;
  doConcentrationCheck: string = "chat";
  griddedGridless: boolean = false;
  gridlessFudge: number | undefined = 0;
  doReactions: string = "all";
  enforceReactions = "none";
  enforceBonusActions = "none";
  enforceSingleWeaponTarget: boolean = false;
  gmAttackDisplay: string = "full";
  gmDamageDisplay: string = "full";
  gmAttackDsn: string = "show";
  gmDamageDsn: string = "show";
  gmAttackDamageCards: boolean = false;
  gmAutoAttack: boolean = false;
  gmAutoDamage: string = "none";
  gmAutoFastForward: string[] = [];
  gmConsumeResource: string = "none";
  gmDoReactions: string = "all";
  gmRemoveButtons: string = "all";
  preferredGM: string = "";
  ignoreSpellReactionRestriction: boolean = false;
  itemTypeList: string[] | undefined = undefined;
  keepRollStats: boolean = false;
  mergeCardCondensed: boolean = false;
  addSheetButtons: boolean = true;
  mergeCardMulti: boolean = false;
  displayProperties: boolean = true;
  midiPropertiesTabRole: number = CONST.USER_ROLES.PLAYER;
  confirmAttackDamage: string = "none";
  highlightSuccess: boolean = true;
  showAttackRollDetails: boolean = true;
  highLightCriticalAttackOnly: boolean = false;
  markPlayerDefeated: boolean = false;
  markNonPlayerDefeated: boolean = false;
  optionalRulesEnabled: boolean = false;
  paranoidGM: boolean = false;
  playerRollSaves: string = "none";
  playerSaveTimeout: number = 0;
  playerStatsOnly: boolean = false;
  rangeTarget: string = "none";
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
  blindRollDisplay: string = "hidden";
  savesBeforeDamage: boolean = false;
  saveStatsEvery: number = 20;
  showFastForward: boolean = false;
  showItemDetails: string = "all";
  showReactionAttackRoll: string = "all";
  showReactionChatMessage: boolean = false;
  singleConcentrationRoll: boolean = true;
  singleDamageCalculation: boolean = true;
  tempHPDamageConcentrationCheck: boolean = true;
  concentrationIncapacitatedConditionCheck: boolean = true;
  toggleOptionalRules: boolean = false;
  useCustomSounds: boolean = true;
  usePlayerPortrait: boolean = false;
  useTokenNames: boolean = false;
  hideNPCNames: string = "";
  undoChatColor: string = "Delete";
  undoWorkflow: boolean = false;
  waitForDamageApplication: boolean = true;
  enforceDeathSaves: boolean = false;
  rollAlternate: string = "off";
  optionalRules = {
    actionSpecialDurationImmediate: false,
    activeDefence: false,
    activeDefenceModifier: 12,
    activeDefenceShow: "self",
    activeDefenceDC: true,
    autoRerollInitiative: false,
    challengeModeArmor: "none",
    checkFlanking: "off",
    flankingBonus: "advantage" as string,
    flankingRequiresVisibility: false,
    showFlankingHighlight: false,
    checkRange: "longfail",
    targetMustBeSeen: "enforce",
    conditionRules: false,
    coverCalculation: "none",
    criticalNat20: false,
    criticalSaves: false,
    displayBonusRolls: true,
    distanceIncludesHeight: false,
    distanceMeasurement: "center", // "center" = grid square centers, "perimeter" = token perimeters
    mountedUseMountSpace: true,
    hiddenAdvantage: "perObserver",
    incapacitated: "nothing",
    invisAdvantage: "RAW2024",
    invisVision: false,
    maxDRValue: false,
    nearbyAllyRanged: 0,
    nearbyFoe: 5,
    optionalCritRule: -1,
    vitalityItem: "", // Item name for vitality pool feature
    vitalityDeadCondition: "dead", // Condition to apply when vitality reaches 0
    vitalityDeathRequires: "vitalityOnly", // "vitalityOnly" = dead when vitality=0, "vitalityAndHP" = dead when vitality=0 AND HP=0
    visionTestHeight: "center",
    templateOriginHeight: "base",
    surfaceOcclusion: true,
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

/**
 * Reset all midi-qol settings to their default values.
 * This resets ConfigSettings, all game.settings (except tracking/stats settings),
 * and ensures EnableWorkflow is set to true.
 * @returns Promise that resolves when settings have been saved
 */
export async function resetConfigSettingsToDefaults(): Promise<void> {
  // Reset ConfigSettings to defaults
  const defaultSettings = new ConfigSettings();
  await game.settings.set("midi-qol", "ConfigSettings", defaultSettings);
  configSettings = defaultSettings;

  // Reset world-scoped game.settings to defaults
  // Note: EnableWorkflow is explicitly set to true as requested
  await game.settings.set("midi-qol", "EnableWorkflow", true);
  // PreferredGM is intentionally not reset - user preference
  await game.settings.set("midi-qol", "ReplaceDefaultActivities", true);
  await game.settings.set("midi-qol", "showGM", false);
  await game.settings.set("midi-qol", "ForceHideRoll", true);
  await game.settings.set("midi-qol", "DragDropTarget", false);
  // RollStats is intentionally not reset - statistics data
  // CriticalDamage/CriticalDamageGM/ColoredBorders are now in configSettings (reset above via defaultSettings)
  await game.settings.set("midi-qol", "AutoRemoveTargets", "dead");
  await game.settings.set("midi-qol", "TargetConfirmation", defaultTargetConfirmationSettings);
  await game.settings.set("midi-qol", "playerControlsInvisibleTokens", false);
  await game.settings.set("midi-qol", "DebounceInterval", 0);
  await game.settings.set("midi-qol", "Debug", "None");
  await game.settings.set("midi-qol", "UseWeakReferences", false);
  await game.settings.set("midi-qol", "splashWarnings", true);
  // last-run-version, instanceId are intentionally not reset - tracking data
  // MidiSoundSettings is intentionally not reset - separate configuration

  Hooks.callAll("midi-qol.ConfigSettingsChanged");
  ui.notifications?.info("midi-qol | Settings reset to defaults");
}

export const checkedModuleList = [
  "about-time",
  "ActiveAuras",
  "auraeffects",
  "autoanimations",
  "anonymous",
  "babonus",
  "cat",
  "chris-premades",
  "condition-lab-triggler",
  "dae",
  "ddb-importer",
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
  // Create a copy of configSettings without deprecated properties
  const cleanConfigSettings = { ...configSettings };
  // Remove deprecated properties that have been migrated
  //@ts-expect-error deprecated property
  delete cleanConfigSettings.displaySaveDC;

  let data = {
    configSettings: cleanConfigSettings,
    midiSoundSettings,
    itemRollButtons,
    autoRemoveTargets,
    coloredBorders,
    criticalDamage,
    criticalDamageGM,
    debounceInterval,
    dragDropTargeting,
    enableWorkflow,
    forceHideRoll,
    nsaFlag,
    playerControlsInvisibleTokens,
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
export function collectModuleData(): Record<string, any> {
  const modules: Record<string, any> = {};
  for (const moduleData of game.modules ?? []) {
    const mod: any = moduleData;
    if (!mod.active && !checkedModuleList.includes(mod.id)) continue;
    let idToUse = mod.id;
    let titleToUse = mod.title;
    if (idToUse.match(/plutonium/i) || titleToUse.match(/plutonium/i)) {
      idToUse = idToUse.replace(/plutonium/i, "xxxxxxxxx");
      titleToUse = titleToUse.replace(/plutonium/i, "xxxxxxxxx");
    }
    modules[idToUse] = {
      title: titleToUse,
      active: mod.active,
      installed: true,
      version: mod.version,
      compatibility: mod.compatibility?.verified
    };
  }
  return modules;
}

export function exportSettingsToJSON() {
  const data = collectSettingData();
  (data as any).modules = collectModuleData();
  const filename = `fvtt-midi-qol-settings.json`;
  foundry.utils.saveDataToFile(JSON.stringify(data, null, 2), "text/json", filename);
}

function removeOldValues(theObject: any) {
  if (theObject == null || typeof theObject !== "object") return theObject;
  Object.keys(theObject).forEach(key => {
    if (theObject[key]?.newValue !== undefined) {
      theObject[key] = theObject[key].newValue;
    }
  });
  return theObject;
}

/**
 * Migrate hideRollDetails + ghostRolls + gmHide3dDice → granular GM display settings.
 * Modifies the configSettings object in place. Only runs if gmAttackDisplay is undefined.
 */
function migrateGmRollHiding(cs: any) {
  if (cs.gmAttackDisplay !== undefined) return;
  const old = cs.hideRollDetails ?? "none";
  const ghost = cs.ghostRolls ?? false;
  const migrationMap: Record<string, { attack: string; damage: string; attackDsn: string; damageDsn: string }> = {
    "none":             { attack: "full",       damage: "full",      attackDsn: "show", damageDsn: "show" },
    "detailsDSN":       { attack: "hideFormula", damage: "full",     attackDsn: "show", damageDsn: "show" },
    "details":          { attack: "hideFormula", damage: "full",     attackDsn: "none", damageDsn: "none" },
    "d20Only":          { attack: "d20Only",    damage: "totalOnly", attackDsn: "show", damageDsn: "none" },
    "d20DamageDSN":     { attack: "d20Only",    damage: "totalOnly", attackDsn: "show", damageDsn: "show" },
    "hitDamage":        { attack: "hitMiss",    damage: "totalOnly", attackDsn: "none", damageDsn: "none" },
    "hitCriticalDamage": { attack: "hitMissCrit", damage: "totalOnly", attackDsn: "none", damageDsn: "none" },
    "attackTotalOnly":  { attack: "attackTotal", damage: "totalOnly", attackDsn: "none", damageDsn: "none" },
    "d20AttackOnly":    { attack: "d20Only",    damage: "hidden",    attackDsn: "show", damageDsn: "none" },
    "all":              { attack: "hidden",     damage: "hidden",    attackDsn: "none", damageDsn: "none" },
  };
  const mapped = migrationMap[old] ?? migrationMap["none"];
  cs.gmAttackDisplay = mapped.attack;
  cs.gmDamageDisplay = mapped.damage;
  cs.gmAttackDsn = ghost ? "ghost" : mapped.attackDsn;
  cs.gmDamageDsn = ghost ? "ghost" : mapped.damageDsn;
  delete cs.hideRollDetails;
  delete cs.ghostRolls;
  delete cs.gmHide3dDice;
}

/**
 * Migrates the deprecated displaySaveDC setting to dnd5e challengeVisibility.
 * Modifies the configSettings object in place, removing the deprecated field.
 * @param configSettingsToMigrate - The configSettings object to migrate (will be modified)
 * @param source - The source of the migration: "startup" for world load, "import" for settings import
 */
async function migrateDisplaySaveDC(configSettingsToMigrate: any, source: "startup" | "import" = "startup") {
  const oldMidiDisplaySaveDC = configSettingsToMigrate.displaySaveDC;
  const currentDnd5eVisibility = safeGetGameSetting("dnd5e", "challengeVisibility") as string;

  // Determine most restrictive: if midi was false (hide DC) OR dnd5e is "none", result is "none"
  let newVisibility = currentDnd5eVisibility;
  if (oldMidiDisplaySaveDC === false || currentDnd5eVisibility === "none") {
    newVisibility = "none";
  }

  // Check if we need to change the dnd5e setting
  const needsChange = newVisibility !== currentDnd5eVisibility;

  // Apply the change if needed
  if (needsChange) {
    await game.settings.set("dnd5e", "challengeVisibility", newVisibility);
  }

  // Remove the deprecated field
  delete configSettingsToMigrate.displaySaveDC;

  // Show migration chat message if GM
  if (game.user === game.users?.activeGM) {
    const sourceText = source === "import"
      ? "The imported settings contained"
      : "Your midi-qol settings contained";

    let messageContent = `<h3>Midi-QOL Settings Migration</h3>`;
    messageContent += `<p>${sourceText} the deprecated <strong>Display Saving Throw DC</strong> setting. It has been migrated to use the dnd5e <strong>Challenge Visibility</strong> setting.</p>`;
    messageContent += `<ul>`;
    messageContent += `<li>Old displaySaveDC: <strong>${oldMidiDisplaySaveDC ? "Show DC" : "Hide DC"}</strong></li>`;
    messageContent += `<li>Previous dnd5e challengeVisibility: <strong>${currentDnd5eVisibility}</strong></li>`;
    if (needsChange) {
      messageContent += `<li>Updated dnd5e challengeVisibility to: <strong>${newVisibility}</strong> (most restrictive)</li>`;
    } else {
      messageContent += `<li>dnd5e challengeVisibility unchanged: <strong>${newVisibility}</strong></li>`;
    }
    messageContent += `</ul>`;
    messageContent += `<p><em>You can control this setting from the dnd5e settings or from the midi-qol config panel under Workflow → Saves.</em></p>`;

    ChatMessage.create({
      content: messageContent,
      whisper: ChatMessage.getWhisperRecipients("GM"),
      speaker: { alias: "Midi-QOL" }
    });
  }
}

export async function importSettingsFromJSON(json) {
  let requiresReload = false;
  if (typeof json === "string")
    json = JSON.parse(json);

  // Extract modules data before unwrapping TroubleShooter format
  let savedModules = json.modules;  // Regular export or TroubleShooter top-level
  if (json.midiSettings) {
    // TroubleShooter format — prefer top-level modules (has settings/incompatible augmentation)
    // but fall back to midiSettings.modules for newer regular exports
    savedModules = savedModules ?? json.midiSettings.modules;
    json = json.midiSettings;  // existing unwrap
  }
  // Also check unwrapped json.modules for regular settings exports
  savedModules = savedModules ?? json.modules;

  // Handle migration of deprecated displaySaveDC field
  const importedConfigSettings = removeOldValues(json.configSettings);
  if (importedConfigSettings.displaySaveDC !== undefined) {
    await migrateDisplaySaveDC(importedConfigSettings, "import");
  }
  // Migrate old hideRollDetails → granular GM display settings on import
  migrateGmRollHiding(importedConfigSettings);

  await game.settings.set("midi-qol", "ConfigSettings", importedConfigSettings);
  await game.settings.set("midi-qol", "MidiSoundSettings", removeOldValues(json.midiSoundSettings) ?? {});
  await game.settings.set("midi-qol", "TargetConfirmation", removeOldValues(json.targetConfirmation));

  // await game.settings.set("midi-qol", "ItemRollButtons", removeOldValues(json.itemRollButtons));
  // Migrate imported old fast-forward settings into new array format
  if (json.autoFastForwardAbilityRolls) {
    const cs = importedConfigSettings;
    if (!Array.isArray(cs.autoFastForward)) cs.autoFastForward = [];
    if (!Array.isArray(cs.gmAutoFastForward)) cs.gmAutoFastForward = [];
    for (const rollType of ["check", "save", "skill", "tool"]) {
      if (!cs.autoFastForward.includes(rollType)) cs.autoFastForward.push(rollType);
      if (!cs.gmAutoFastForward.includes(rollType)) cs.gmAutoFastForward.push(rollType);
    }
    await game.settings.set("midi-qol", "ConfigSettings", cs);
  }
  await game.settings.set("midi-qol", "AutoRemoveTargets", removeOldValues(json.autoRemoveTargets));
  // Migrate old top-level coloredBorders into configSettings for backward-compatible imports
  if (json.coloredBorders !== undefined && !importedConfigSettings.coloredBorders) {
    let cb = removeOldValues(json.coloredBorders);
    if (cb === "None") cb = "none"; // Normalize old default
    importedConfigSettings.coloredBorders = cb;
    await game.settings.set("midi-qol", "ConfigSettings", importedConfigSettings);
  }
  // Migrate old top-level criticalDamage/criticalDamageGM into configSettings for backward-compatible imports
  if (json.criticalDamage !== undefined && !importedConfigSettings.criticalDamage) {
    importedConfigSettings.criticalDamage = removeOldValues(json.criticalDamage);
    if (importedConfigSettings.criticalDamage === "none") importedConfigSettings.criticalDamage = "default";
  }
  if (json.criticalDamageGM !== undefined && !importedConfigSettings.criticalDamageGM) {
    importedConfigSettings.criticalDamageGM = removeOldValues(json.criticalDamageGM);
    if (importedConfigSettings.criticalDamageGM === "none") importedConfigSettings.criticalDamageGM = importedConfigSettings.criticalDamage ?? "default";
  }
  if (json.criticalDamage !== undefined || json.criticalDamageGM !== undefined) {
    await game.settings.set("midi-qol", "ConfigSettings", importedConfigSettings);
  }
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
  await game.settings.set("midi-qol", "showGM", removeOldValues(json.nsaFlag));
  await game.settings.set("midi-qol", "UseWeakReferences", removeOldValues(json.useWeakReferences));
  if (json.playerControlsInvisibleTokens !== undefined) {
    if (game.settings.get("midi-qol", "playerControlsInvisibleTokens") !== json.playerControlsInvisibleTokens) requiresReload = true;
    await game.settings.set("midi-qol", "playerControlsInvisibleTokens", json.playerControlsInvisibleTokens);
  }
  const settingsAppId = game.settings.sheet?.id;
  if (settingsAppId) foundry.applications.instances.get(settingsAppId)?.render(true);
  const exportSource = json.flags?.exportSource;
  ui.notifications?.notify(`Importing settings from foundry version ${exportSource?.coreVersion} dnd ${exportSource?.systemVersion} midi ${exportSource?.midiVersion}`);

  // Show module review dialog if saved modules include modules not active or with lower installed versions
  if (savedModules && Object.keys(savedModules).length > 0) {
    const activeModules = Object.fromEntries(
      Object.entries(savedModules).filter(([_, mod]: [string, any]) => mod.active)
    );
    const hasMismatch = Object.entries(activeModules).some(([id, mod]: [string, any]) => {
      const current = game.modules.get(id);
      if (!current?.active) return true;
      // Check if installed version is lower than saved version
      if (current.version && mod.version && foundry.utils.isNewerVersion(mod.version, current.version)) return true;
      return false;
    });
    if (hasMismatch) {
      new ModuleReviewDialog(activeModules).render(true);
    }
  }

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

// Settings load from several places; the deprecation is reported once per session
let warnedRollAlternate = false;
export let fetchParams = () => {
  if (debugEnabled > 1) debug("Fetch Params Loading");
  const blfxActive = game.modules.get("boss-loot-assets-premium")?.active || game.modules.get("boss-loot-assets-free")?.active;

  const showedAttackRollDetails = configSettings?.showAttackRollDetails ?? true;
  configSettings = game.settings.get("midi-qol", "ConfigSettings");
  if (configSettings.saveDROrder === undefined) configSettings.saveDROrder = "DRSaveDr";
  if (configSettings.singleDamageCalculation === undefined) configSettings.singleDamageCalculation = true;
  if (!["DRSaveDr", "SaveDRDr", "SaveDrDR"].includes(configSettings.saveDROrder)) {
    ui.notifications?.warn("invalidSaveDROrder reset to 'dm.midi/dnd5e.dm -> Saves/(dr/dv/di) - dnd5e RAW'");
    configSettings.saveDROrder = "DRSaveDr";
  }
  if (!configSettings.doReactions) configSettings.doReactions = "none";
  if (!configSettings.gmDoReactions) configSettings.gmDoReactions = "none";
  if (configSettings.reactionTimeout === undefined) configSettings.reactionTimeout = 0;
  if (typeof configSettings.rangeTarget !== "string") configSettings.rangeTarget = "none";
  if (configSettings.showReactionAttackRoll === undefined) configSettings.showReactionAttackRoll = "all";
  //@ts-expect-error type mismatch - this is for legacy true setting
  if (configSettings.rollChecksBlind === true) configSettings.rollChecksBlind = ["all"];
  if (!configSettings.rollChecksBlind) configSettings.rollChecksBlind = [];
  configSettings.rollChecksBlind = configSettings.rollChecksBlind.filter((item) => item !== "none");
  //@ts-expect-error type mismatch - this is for legacy true setting
  if (configSettings.rollSavesBlind === true) configSettings.rollSavesBlind = ["all"];
  if (!configSettings.rollSavesBlind) configSettings.rollSavesBlind = [];
  configSettings.rollSavesBlind = configSettings.rollSavesBlind.filter((item) => item !== "none");
  //@ts-expect-error type mismatch - this is for legacy true setting
  if (configSettings.rollSkillsBlind === true) configSettings.rollSkillsBlind = ["all"];
  if (!configSettings.rollSkillsBlind) configSettings.rollSkillsBlind = [];
  configSettings.rollSkillsBlind = configSettings.rollSkillsBlind.filter((item) => item !== "none");
  migrateGmRollHiding(configSettings);
  if (configSettings.addFakeDice === undefined) configSettings.addFakeDice = false;
  if (configSettings.rulesTextFill === undefined) configSettings.rulesTextFill = true;
  if (typeof configSettings.gmConsumeResource !== "string") configSettings.gmConsumeResource = "none";
  if (typeof configSettings.consumeResource !== "string") configSettings.consumeResource = "none";
  // ddb-game-log support is gone
  if (configSettings.optionalRules) Reflect.deleteProperty(configSettings.optionalRules, "enableddbGL");
  Reflect.deleteProperty(configSettings, "enableDDBGL");
  if (!configSettings.showReactionChatMessage) configSettings.showReactionChatMessage = false;
  //@ts-expect-error legacy boolean value
  if (configSettings.autoCEEffects === true) configSettings.autoCEEffects = "both";
  if (!configSettings.autoCEEffects) configSettings.autoCEEffects = "none";
  configSettings.toggleOptionalRules = false;
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
  if (["adv", "formulaadv"].includes(configSettings.rollAlternate) && !warnedRollAlternate) {
    warnedRollAlternate = true;
    foundry.utils.logCompatibilityWarning("midi-qol | Move roll formula to tooltip: the Advantage Attribution options are deprecated. The sources of advantage/disadvantage are shown by the info icon on the roll's label.",
      { since: "midi-qol 14.6.5", until: "midi-qol 14.8" });
  }
  if (configSettings.allowActorUseMacro === undefined) configSettings.allowActorUseMacro = configSettings.allowUseMacro;

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
  if (configSettings.showFastForward === undefined) configSettings.showFastForward = true;
  if (configSettings.highlightSuccess === undefined) configSettings.highlightSuccess = true;
  if (configSettings.highLightCriticalAttackOnly === undefined) configSettings.highLightCriticalAttackOnly = false;
  configSettings.optionalRules = foundry.utils.mergeObject(new ConfigSettings().optionalRules, configSettings.optionalRules ?? {}, { overwrite: true, insertKeys: true, insertValues: true });
  // Was read and defaulted under a capitalised key the Rules tab never set (its checkbox saved an unticked false); carry it over once.
  if ("ActiveDefenceDC" in configSettings.optionalRules) {
    configSettings.optionalRules.activeDefenceDC = !!Reflect.get(configSettings.optionalRules, "ActiveDefenceDC");
    Reflect.deleteProperty(configSettings.optionalRules, "ActiveDefenceDC");
  }
  // Legacy boolean: true checked actions without stopping them
  if (String(configSettings.optionalRules.incapacitated) === "true") configSettings.optionalRules.incapacitated = "warn";
  if (!configSettings.optionalRules.incapacitated) configSettings.optionalRules.incapacitated = "nothing";
  if (!configSettings.optionalRules.wallsBlockRange) configSettings.optionalRules.wallsBlockRange = "center";
  // v14 Levels has no CONFIG.Levels.API/TemplateHandler; its sight wrapper is one "center" already uses.
  if (configSettings.optionalRules.wallsBlockRange === "centerLevels") configSettings.optionalRules.wallsBlockRange = "center";
  //@ts-expect-error legacy boolean value
  if (configSettings.optionalRules.checkFlanking === true) configSettings.optionalRules.checkFlanking = "ceadv";
  if (!configSettings.optionalRules.coverCalculation) configSettings.optionalRules.coverCalculation = "none";
  if (configSettings.optionalRules.displayBonusRolls === undefined) configSettings.optionalRules.displayBonusRolls = true;
  if (!configSettings.optionalRules.vitalityDeadCondition) configSettings.optionalRules.vitalityDeadCondition = "dead";
  if (!configSettings.optionalRules.vitalityDeathRequires) configSettings.optionalRules.vitalityDeathRequires = "vitalityOnly";

  //@ts-expect-error legacy boolean value
  if (configSettings.optionalRules.checkFlanking === false) configSettings.optionalRules.checkFlanking = "off";
  if ([true, "longFail"].includes(configSettings.optionalRules.checkRange)) configSettings.optionalRules.checkRange = "longfail";
  if (!configSettings.optionalRules.checkRange) configSettings.optionalRules.checkRange = "none";
  configSettings.optionalRules.targetMustBeSeen ??= "enforce";
  // Never set: the default; the old boolean off stays off
  //@ts-expect-error legacy boolean value
  if (configSettings.optionalRules.invisAdvantage === false) configSettings.optionalRules.invisAdvantage = "none";
  if (!configSettings.optionalRules.invisAdvantage) configSettings.optionalRules.invisAdvantage = "RAW2024";
  //@ts-expect-error legacy boolean value
  if (configSettings.optionalRules.invisAdvantage === true) configSettings.optionalRules.invisAdvantage = "RAW2014";
  // Migrate old "RAW" to "RAW2014"
  if (configSettings.optionalRules.invisAdvantage === "RAW") configSettings.optionalRules.invisAdvantage = "RAW2014";
  // "effect" (Check 'Hidden' Status: hidden from everyone) became the per-observer rule (lib/hiding.ts)
  if (!configSettings.optionalRules.hiddenAdvantage || configSettings.optionalRules.hiddenAdvantage === "effect") configSettings.optionalRules.hiddenAdvantage = "perObserver";
  //@ts-expect-error legacy nonexistent value
  if (configSettings.optionalRules.activeDefenceShowGM === true) {
    // old setting replaced with new
    configSettings.optionalRules.activeDefenceShow = "gm";
    //@ts-expect-error legacy nonexistent value
    delete configSettings.optionalRules.activeDefenceShowGM;
  }
  // Foundry 14 message modes replace the roll modes the panel used to offer.
  const legacyMode = { publicroll: "public", gmroll: "gm", blindroll: "blind", selfroll: "self" }[configSettings.optionalRules.activeDefenceShow];
  if (legacyMode) configSettings.optionalRules.activeDefenceShow = legacyMode;
  if (typeof configSettings.confirmAttackDamage !== "string") configSettings.confirmAttackDamage = "none";
  if (typeof configSettings.requireMagical !== "string" && configSettings.requireMagical !== true) configSettings.requireMagical = "off";
  if (typeof configSettings.requireMagical !== "string" && configSettings.requireMagical === true) configSettings.requireMagical = "nonspell";

  if (typeof configSettings.optionalRules.nearbyFoe !== "number") {
    if (configSettings.optionalRulesEnabled)
      configSettings.optionalRules.nearbyFoe = 5;
    else
      configSettings.optionalRules.nearbyFoe = 0;
  }
  const itemList = Object.keys(CONFIG.Item.typeLabels);
  if (!configSettings.itemTypeList && itemList.length > 0) {
    configSettings.itemTypeList = itemList;
    configSettings.itemTypeList.filter((type) => !["base", "backpack"].includes(type));
  }
  if (configSettings.itemTypeList === undefined) configSettings.itemTypeList = Object.keys(CONFIG.Item.typeLabels);
  if (configSettings.defaultSaveMult === undefined) configSettings.defaultSaveMult = 0.5;
  if (configSettings.ignoreSpellReactionRestriction === undefined) configSettings.ignoreSpellReactionRestriction = false;
  if (configSettings.damageImmunityMultiplier === undefined) configSettings.damageImmunityMultiplier = 0.0;
  if (configSettings.damageResistanceMultiplier === undefined) configSettings.damageResistanceMultiplier = 0.5;
  if (configSettings.damageVulnerabilityMultiplier === undefined) configSettings.damageVulnerabilityMultiplier = 2;
  if (configSettings.saveSummaryStyle === undefined) configSettings.saveSummaryStyle = "midi";
  if (!configSettings.chatCardSummaries) configSettings.chatCardSummaries = "client";
  void applyChatCardSummaries();
  if (configSettings.attackPerTarget === undefined) configSettings.attackPerTarget = false;
  if (configSettings.showAttackRollDetails === undefined) configSettings.showAttackRollDetails = true;
  // The cards already on screen show or drop the details as they are drawn again
  if (game.ready && configSettings.showAttackRollDetails !== showedAttackRollDetails)
    for (const message of game.messages?.contents.slice(-100) ?? []) void ui.chat?.updateMessage(message);
  if (configSettings.autoRemoveTemplate === undefined) configSettings.autoRemoveTemplate = true;
  if (configSettings.autoRemoveInstantaneousTemplate === undefined) configSettings.autoRemoveInstantaneousTemplate = false;
  if (configSettings.removeConcentrationEffects === undefined) configSettings.removeConcentrationEffects = "effects";
  if (configSettings.doConcentrationCheck === undefined) configSettings.doConcentrationCheck = configSettings.removeConcentration ? "chat" : "none";
  if (configSettings.undoWorkflow === undefined) configSettings.undoWorkflow = false;
  if (configSettings.undoChatColor === undefined) configSettings.undoChatColor = "Delete";
  // Undone cards are coloured by CSS from this, so a change recolours them all.
  document.documentElement.style.setProperty("--midi-qol-undone-color", configSettings.undoChatColor === "Delete" ? "transparent" : configSettings.undoChatColor);
  if (configSettings.enforceSingleWeaponTarget == undefined) configSettings.enforceSingleWeaponTarget = false;
  if (configSettings.confirmAmmunition === undefined) configSettings.confirmAmmunition = false;
  if (configSettings.gmConfirmAmmunition === undefined) configSettings.gmConfirmAmmunition = false;
  if (configSettings.playerRollSaves === "noneDialog") configSettings.playerRollSaves = "noneDialogPrivate";
  // Removed: one damage card now serves the GM and the players
  Reflect.deleteProperty(configSettings, "hidePlayerDamageCard");
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
  // Removed setting (midi always applies the damage detail); kept readable for macros, never saved.
  Object.defineProperty(configSettings, "useDamageDetail", {
    configurable: true, enumerable: false,
    get() {
      foundry.utils.logCompatibilityWarning("MidiQOL.configSettings().useDamageDetail is deprecated: midi always applies the damage detail.", { since: "midi-qol 14.6.5", until: "midi-qol 14.8" });
      return true;
    }
  });
  if (configSettings.collapsibleTargets === undefined) configSettings.collapsibleTargets = true;
  if (configSettings.displayProperties === undefined) configSettings.displayProperties = true;
  criticalDamage = configSettings.criticalDamage ?? "default";
  if (!configSettings.criticalDamageGM || configSettings.criticalDamageGM === "none") configSettings.criticalDamageGM = criticalDamage;
  criticalDamageGM = configSettings.criticalDamageGM;
  nsaFlag = game.settings.get("midi-qol", "showGM");
  const previousColoredBorders = coloredBorders;
  coloredBorders = configSettings.coloredBorders ?? "none";
  // Chat cards are styled as they render, so redraw the messages already in the log for a changed setting.
  const chatLog = ui.chat;
  if (previousColoredBorders !== undefined && previousColoredBorders !== coloredBorders && chatLog?.rendered) {
    chatLog.element.querySelectorAll<HTMLElement>("li.chat-message[data-message-id]").forEach(el => {
      const message = game.messages?.get(el.dataset.messageId ?? "");
      if (message) chatLog.updateMessage(message);
    });
  }
  itemRollButtons = false; // game.settings.get("midi-qol", "ItemRollButtons");

  // Migrate old fast-forward settings to new granular arrays
  if (!fastForwardMigrationDone) {
    let needsFastForwardMigration = false;
    const oldFastForwardPlayer = typeof configSettings.autoFastForward === "string" ? configSettings.autoFastForward : undefined;
    //@ts-expect-error checking for old boolean format
    const oldGmFfAttack: boolean | undefined = typeof configSettings.gmAutoFastForwardAttack === "boolean" ? configSettings.gmAutoFastForwardAttack : undefined;
    //@ts-expect-error checking for old boolean format
    const oldGmFfDamage: boolean | undefined = typeof configSettings.gmAutoFastForwardDamage === "boolean" ? configSettings.gmAutoFastForwardDamage : undefined;
    let oldAbilityRolls: boolean | undefined;

    if (typeof configSettings.autoFastForward === "string") {
      const oldValue = configSettings.autoFastForward as unknown as string;
      const newValue: string[] = [];
      if (oldValue === "attack" || oldValue === "all") newValue.push("attack");
      if (oldValue === "damage" || oldValue === "all") newValue.push("damage");
      configSettings.autoFastForward = newValue;
      needsFastForwardMigration = true;
    }
    if (oldGmFfAttack !== undefined || oldGmFfDamage !== undefined) {
      const newGmValue: string[] = [];
      if (oldGmFfAttack) newGmValue.push("attack");
      if (oldGmFfDamage) newGmValue.push("damage");
      configSettings.gmAutoFastForward = newGmValue;
      //@ts-expect-error cleanup old properties
      delete configSettings.gmAutoFastForwardAttack;
      //@ts-expect-error cleanup old properties
      delete configSettings.gmAutoFastForwardDamage;
      needsFastForwardMigration = true;
    }
    // Migrate standalone AutoFastForwardAbilityRolls setting into the arrays
    try {
      oldAbilityRolls = game.settings.get("midi-qol", "AutoFastForwardAbilityRolls") as boolean;
      if (oldAbilityRolls) {
        for (const rollType of ["check", "save", "skill", "tool"]) {
          if (!configSettings.autoFastForward.includes(rollType)) configSettings.autoFastForward.push(rollType);
          if (!configSettings.gmAutoFastForward.includes(rollType)) configSettings.gmAutoFastForward.push(rollType);
        }
        needsFastForwardMigration = true;
      }
    } catch (e) {
      // Setting may not be registered yet or already removed - that's fine
    }
    if (needsFastForwardMigration) {
      console.warn("midi-qol | Migrated fast-forward settings to granular arrays:",
        `\n  Player autoFastForward: "${oldFastForwardPlayer ?? "(already migrated)"}" → [${configSettings.autoFastForward.join(", ")}]`,
        `\n  GM gmAutoFastForwardAttack: ${oldGmFfAttack ?? "(already migrated)"}, gmAutoFastForwardDamage: ${oldGmFfDamage ?? "(already migrated)"} → gmAutoFastForward: [${configSettings.gmAutoFastForward.join(", ")}]`,
        `\n  AutoFastForwardAbilityRolls: ${oldAbilityRolls ?? false}`
      );
      // Defer settings writes until game is ready (fetchParams may be called from init/setup hooks)
      const persistMigration = () => {
        game.settings.set("midi-qol", "ConfigSettings", configSettings);
        if (oldAbilityRolls) game.settings.set("midi-qol", "AutoFastForwardAbilityRolls", false);
      };
      if (game.ready) persistMigration();
      else Hooks.once("ready", persistMigration);
    }
    fastForwardMigrationDone = true;
  }
  if (!Array.isArray(configSettings.autoFastForward)) configSettings.autoFastForward = [];
  if (!Array.isArray(configSettings.gmAutoFastForward)) configSettings.gmAutoFastForward = [];

  // Migrate standalone PreferredGM setting into configSettings
  if (configSettings.preferredGM === undefined) {
    try {
      const oldPreferredGM = game.settings.get("midi-qol", "PreferredGM") as string;
      if (oldPreferredGM && oldPreferredGM !== "") {
        configSettings.preferredGM = oldPreferredGM;
        console.warn(`midi-qol | Migrated PreferredGM setting "${oldPreferredGM}" into configSettings`);
        game.settings.set("midi-qol", "ConfigSettings", configSettings);
      } else {
        configSettings.preferredGM = "";
      }
    } catch (e) {
      configSettings.preferredGM = "";
    }
  }

  // Migrate standalone CriticalDamage/CriticalDamageGM settings into configSettings
  if (configSettings.criticalDamage === undefined) {
    try {
      const oldCriticalDamage = game.settings.get("midi-qol", "CriticalDamage") as string;
      configSettings.criticalDamage = (!oldCriticalDamage || oldCriticalDamage === "none") ? "default" : oldCriticalDamage;
      const oldCriticalDamageGM = game.settings.get("midi-qol", "CriticalDamageGM") as string;
      configSettings.criticalDamageGM = (!oldCriticalDamageGM || oldCriticalDamageGM === "none") ? configSettings.criticalDamage : oldCriticalDamageGM;
      console.warn(`midi-qol | Migrated CriticalDamage settings into configSettings (player: "${configSettings.criticalDamage}", GM: "${configSettings.criticalDamageGM}")`);
      game.settings.set("midi-qol", "ConfigSettings", configSettings);
    } catch (e) {
      configSettings.criticalDamage = "default";
      configSettings.criticalDamageGM = "default";
    }
  }

  // Migrate standalone ColoredBorders setting into configSettings
  if (configSettings.coloredBorders === undefined) {
    try {
      const oldColoredBorders = game.settings.get("midi-qol", "ColoredBorders") as string;
      // Normalize "None" (old default) to "none" (matches options keys)
      configSettings.coloredBorders = (!oldColoredBorders || oldColoredBorders === "None") ? "none" : oldColoredBorders;
      console.warn(`midi-qol | Migrated ColoredBorders setting "${oldColoredBorders}" into configSettings as "${configSettings.coloredBorders}"`);
      game.settings.set("midi-qol", "ConfigSettings", configSettings);
    } catch (e) {
      configSettings.coloredBorders = "none";
    }
  }

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
  // The config form saved this checkbox under a misspelt key.
  if (targetConfirmation && "mixedDispositiion" in targetConfirmation) {
    targetConfirmation.mixedDisposition ||= !!targetConfirmation.mixedDispositiion;
    Reflect.deleteProperty(targetConfirmation, "mixedDispositiion");
  }

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

  // Migration: displaySaveDC -> dnd5e challengeVisibility
  //@ts-expect-error legacy property that's been removed from ConfigSettings
  if (configSettings.displaySaveDC !== undefined && game.user === game.users?.activeGM) {
    Hooks.once("ready", async () => {
      await migrateDisplaySaveDC(configSettings, "startup");
      await game.settings.set("midi-qol", "ConfigSettings", configSettings);
    });
  }

  // Settings added since the world last saved them, or left out of an imported file, take their defaults
  const defaults = new ConfigSettings();
  for (const key of Object.keys(defaults) as (keyof ConfigSettings)[]) {
    if (configSettings[key] === undefined) Object.assign(configSettings, { [key]: foundry.utils.deepClone(defaults[key]) });
  }

  updateFlankingStatusEffects();
  Hooks.callAll("midi-qol.ConfigSettingsChanged");
}

export function readySettingsSetup() {
  // Deprecated: PreferredGM has moved to configSettings.preferredGM (shown on GM tab)
  // Kept registered for migration from old setting value
  game.settings.register("midi-qol", "PreferredGM", {
    name: "midi-qol.PreferredGM.Name",
    hint: "midi-qol.PreferredGM.Hint",
    scope: "world",
    default: "",
    config: false,
    type: String,
  });
}

function keysToOptionsObj(prefix: string, keys: string[]): Record<string, string> {
  return Object.fromEntries(keys.map(key => [key, `midi-qol.${prefix}.${key}`]));
}

function keysToExtendedOptionsObj(prefix: string, keys: string[]): SelectOptions {
  return Object.fromEntries(keys.map(key => [key, {
    label: `midi-qol.${prefix}.${key}`,
    hint: `midi-qol.${prefix}.expandedHints.${key}`
  }]));
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

export const autoRollDamageOptions = keysToExtendedOptionsObj("autoRollDamageOptions", [
  "none",
  "always",
  "saveOnly",
  "onHit"
]);

export const autoCheckHitOptions = keysToExtendedOptionsObj("autoCheckHitOptions", [
  "none",
  "all",
  "whisper",
  "gmOnly"
]);


export const clickOptions = keysToExtendedOptionsObj("clickOptions", [
  "off",
  "attack",
  "damage",
  "all"
]);

export const autoTargetOptions = keysToExtendedOptionsObj("autoTargetOptions", [
  "none",
  "always",
  "alwaysIgnoreIncapacitated",
  "alwaysIgnoreDefeated",
  "wallsBlock",
  "wallsBlockIgnoreIncapacitated",
  "wallsBlockIgnoreDefeated",
  "walledtemplates"
]);


export const saveSummaryStyleOptions = keysToExtendedOptionsObj("saveSummaryStyleOptions", ["midi", "dnd5e"]);
export const chatCardSummariesOptions = keysToExtendedOptionsObj("chatCardSummariesOptions", ["client", "always", "never"]);

export const autoCheckSavesOptions = keysToExtendedOptionsObj("autoCheckSavesOptions", [
  "none",
  "allNoRoll",
  "all",
  "allShow",
  "whisper",
  "gmOnly",
]);


export const rangeTargetOptions = keysToExtendedOptionsObj("rangeTargetOptions", [
  "none",
  "always",
  "alwaysIgnoreIncapacitated",
  "alwaysIgnoreDefeated",
  "wallsBlock",
  "wallsBlockIgnoreIncapacitated",
  "wallsBlockIgnoreDefeated"
]);


export const autoApplyDamageOptions = keysToExtendedOptionsObj("autoApplyDamageOptions", [
  "none",
  "noCard",
  "noCardMisses",
  "yes",
  "yesCard",
  "yesCardMisses",
  "yesCardNPC"
]);


export const playerDamageCardOptions = keysToExtendedOptionsObj("playerDamageCardOptions", [
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

export const damageImmunitiesOptions = keysToExtendedOptionsObj("damageImmunitiesOptions", [
  "none",
  "immunityDefault",
  "immunityPhysical"
]);

export const showItemDetailsOptions = keysToExtendedOptionsObj("showItemDetailsOptions", [
  "none",
  "cardOnly",
  "pc",
  "all"
]);

export const rollNPCSavesOptions = keysToExtendedOptionsObj("rollNPCSavesOptions", [
  "none",
  "auto",
  "autoDialog",
  "mtb",
  "ftb",
  "rer"
]);

export const playerRollSavesOptions = keysToExtendedOptionsObj("playerRollSavesOptions", [
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

export const playerRollSavesOptionsReduced = keysToExtendedOptionsObj("playerRollSavesOptionsReduced", [
  "none",
  "chat"
]);

export const hideRollDetailsOptions = keysToExtendedOptionsObj("hideRollDetailsOptions", [
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

export const gmAttackDisplayOptions = keysToExtendedOptionsObj("gmAttackDisplayOptions", [
  "full",
  "hideFormula",
  "d20Only",
  "attackTotal",
  "hitMiss",
  "hitMissCrit",
  "hidden"
]);

export const gmDamageDisplayOptions = keysToExtendedOptionsObj("gmDamageDisplayOptions", [
  "full",
  "totalOnly",
  "hidden"
]);

export const gmDsnDisplayOptions = keysToExtendedOptionsObj("gmDsnDisplayOptions", [
  "show",
  "ghost",
  "none"
]);

export const blindRollDisplayOptions = keysToExtendedOptionsObj("blindRollDisplayOptions", [
  "hidden",
  "obscured"
]);

export const rollOtherDamageOptions = keysToExtendedOptionsObj("RollOtherDamageOptions", [
  "none",
  "always",
  "condition",
  "ifSave"
]);

export const showReactionAttackRollOptions = keysToExtendedOptionsObj("ShowReactionAttackRollOptions", [
  "none",
  "d20",
  "all",
  "allCrit"
]);

export const onUseMacroOptions = keysToExtendedOptionsObj("onUseMacroOptions", [
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
  "preTeleport",
  "postTeleport",
  "isDamaged",
  "all"
]);

export const ammunitionPerTargetOptions = keysToOptionsObj("AmmunitionPerTargetOptions", [
  "default",
  "use",
  "target"
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

/** Key for "downgrade immunity to resistance". Lives alongside the ignore keys in the same set. */
export const DOWNGRADE_IMMUNITY_KEY = "ddi";

/** dnd5e's trait value for "All Damage". Not a member of CONFIG.DND5E.damageTypes. */
export const ALL_DAMAGE_KEY = "ALL";

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
,
  ddi: {
    label: "midi-qol.SHARED.FIELDS.midiProperties.ignoreTraits.ddi.label",
    hint: "midi-qol.SHARED.FIELDS.midiProperties.ignoreTraits.ddi.hint"
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
  idm: "midi-qol.SHARED.FIELDS.midiProperties.ignoreTraits.idm.short",
  ddi: "midi-qol.SHARED.FIELDS.midiProperties.ignoreTraits.ddi.short"
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

export const autoCEEffectsOptions = keysToExtendedOptionsObj("AutoCEEffectsOptions", [
  "none",
  "itempri",
  "cepri",
  "both"
]);


export const visionTestHeightOptions = keysToExtendedOptionsObj("VisionTestHeightOptions", [
  "center",
  "top"
]);

export const templateOriginHeightOptions = keysToExtendedOptionsObj("TemplateOriginHeightOptions", [
  "base",
  "top",
  "eye"
]);

export const wallsBlockRangeOptionsNew = keysToExtendedOptionsObj("WallsBlockRangeOptionsNew", [
  "none",
  "center",
  "levelsautocover",
  "simbuls-cover-calculator",
  "tokencover",
  "simplecover5e"
]);

export const coverCalculationOptions = keysToExtendedOptionsObj("CoverCalculationOptions", [
  "none",
  "dnd5eStatus",
  "simbuls-cover-calculator",
  "simplecover5e",
  "levelsautocover",
  "tokencover"
]);


export const hiddenAdvantageOptions = keysToExtendedOptionsObj("HiddenAdvantageOptions", [
  "none",
  "perObserver",
  "perObserverPassive",
  "perceptive"
]);

export const addDeadOptions = keysToExtendedOptionsObj("AddDeadOptions", [
  "none",
  "overlay",
  "normal"
]);

export const requiresTargetsOptions = keysToExtendedOptionsObj("requiresTargetsOptions", [
  "none",
  "combat",
  "tokens",
  "always"
]);

export const doReactionsOptions = keysToExtendedOptionsObj("DoReactionsOptions", [
  "all",
  "allMI",
  "none"
]);

export const gmDoReactionsOptions = keysToExtendedOptionsObj("GMDoReactionsOptions", [
  "all",
  "allMI",
  "none"
]);

export const recordAOOOptions = keysToExtendedOptionsObj("RecordAOOOptions", [
  "none",
  "character",
  "all"
]);

export const EnforceReactionsOptions = keysToExtendedOptionsObj("EnforceReactionsOptions", [
  "none",
  "displayOnly",
  "character",
  "all"
]);

export const autoEffectsOptions = keysToExtendedOptionsObj("AutoEffectsOptions", [
  "off",
  "applyNoButton",
  "applyRemove",
  "applyLeave"
]);


export const requireMagicalOptions = keysToExtendedOptionsObj("RequireMagicalOptions", [
  "off",
  "nonspell",
  "allitems"
]);

export const checkFlankingOptions = keysToExtendedOptionsObj("CheckFlankingOptions", [
  "off",
  "advonly",
  "ceonly",
  "midiFlanking",
  "ceflanked",
  "midiFlanked",
  "ceflankedNoconga",
  "midiFlankedNoConga"
]);

export const flankingBonusOptions = {
  "advantage": "midi-qol.FlankingBonusOptions.advantage",
  "1": "midi-qol.FlankingBonusOptions.1",
  "2": "midi-qol.FlankingBonusOptions.2",
  "3": "midi-qol.FlankingBonusOptions.3",
  "4": "midi-qol.FlankingBonusOptions.4",
  "5": "midi-qol.FlankingBonusOptions.5",
};

export const rollAlternateOptions = keysToExtendedOptionsObj("RollAlternateOptions", [
  "off",
  "formula",
  "adv",
  "formulaadv"
]);

export const consumeResourceOptions = keysToExtendedOptionsObj("ConsumeResourceOptions", [
  "none",
  "spell",
  "item",
  "both"
]);

export const averageDamageOptions = keysToExtendedOptionsObj("AverageDamageOptions", [
  "none",
  "npc",
  "character",
  "all"
]);

export const removeConcentrationEffectsOptions = keysToExtendedOptionsObj("RemoveConcentrationEffectsOptions", [
  "none",
  "effects",
  "effectsTemplates"
]);

export const incapacitatedOptions = keysToExtendedOptionsObj("IncapacitatedOptions", [
  "nothing",
  "enforce",
  "warn"
]);

export const targetMustBeSeenOptions = keysToExtendedOptionsObj("TargetMustBeSeenOptions", [
  "nothing",
  "enforce",
  "warn"
]);

export const checkRangeOptions = keysToExtendedOptionsObj("CheckRangeOptions", [
  "none",
  "longfail",
  "longdisadv"
]);

export const distanceMeasurementOptions = keysToExtendedOptionsObj("DistanceMeasurementOptions", [
  "default",
  "center",
  "perimeter"
]);

export const invisAdvantageOptions = keysToExtendedOptionsObj("InvisAdvantageOptions", [
  "none",
  "RAW2014",
  "RAW2024",
  "vision"
]);

export const confirmAttackDamageOptions = keysToExtendedOptionsObj("ConfirmAttackDamageOptions", [
  "none",
  "gmOnly",
  "GMPlayer"
]);

export const challengeModeArmorOptions = keysToExtendedOptionsObj("ChallengeModeArmorOptions", [
  "none",
  "challenge",
  "scale",
  "scaleNoAR"
]);

export const defaultOtherActivityOptions = keysToExtendedOptionsObj("DefaultOtherActivityOptions", [
  "auto",
  "none"
]);

export const saveDROrderOptions = keysToExtendedOptionsObj("SaveDROrderOptions", [
  "DRSaveDr",
  "SaveDRDr",
  "SaveDrDR"
]);

export const doConcentrationCheckOptions = keysToExtendedOptionsObj("DoConcentrationCheckOptions", [
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

  // ========================================
  // Hidden settings (config: false) - registered first
  // ========================================

  game.settings.register("midi-qol", "ConfigSettings", {
    scope: "world",
    // @ts-expect-error Object type is valid for Foundry settings
    type: Object,
    default: configSettings,
    onChange: fetchParams,
    config: false
  });

  game.settings.register("midi-qol", "MidiSoundSettings", {
    scope: "world",
    type: Object,
    default: midiSoundSettings,
    onChange: fetchSoundSettings,
    config: false
  });

  game.settings.register("midi-qol", "MidiSoundSettings-backup", {
    scope: "world",
    type: Object,
    default: {},
    config: false
  });

  game.settings.register("midi-qol", "acknowledgedOverlaps", {
    scope: "world",
    default: [],
    type: Array,
    config: false
  });
  game.settings.register("midi-qol", "RollStats", {
    scope: "world",
    default: {},
    type: Object,
    config: false,
    onChange: () => {
      // Only non-GM clients should reload stats from the database.
      // The GM's in-memory currentStats is the authoritative copy;
      // reloading here would overwrite unsaved increments (race condition).
      if (!game.user?.isGM) {
        gameStats.fetchStats();
      }
      Hooks.callAll("midi-qol.StatsUpdated");
    }
  });

  game.settings.register("midi-qol", "TargetConfirmation", {
    scope: "client",
    type: Object,
    default: defaultTargetConfirmationSettings,
    config: false,
    onChange: fetchParams
  });

  game.settings.register("midi-qol", "splashWarnings", {
    scope: "world",
    type: Boolean,
    config: false,
    default: true
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

  // ========================================
  // Visible settings (config: true)
  // ========================================

  registerHiddenGroundCueSetting();
  registerChatCardSummariesSetting();
  registerRulesTextSettings();

  game.settings.register("midi-qol", "EnableWorkflow", {
    name: i18n("midi-qol.EnableWorkflow.Name"),
    hint: i18n("midi-qol.EnableWorkflow.Hint"),
    scope: "client",
    default: true,
    config: true,
    type: Boolean,
    onChange: fetchParams
  });

  // Deprecated: PreferredGM has moved to configSettings.preferredGM (shown on GM tab)
  game.settings.register("midi-qol", "PreferredGM", {
    name: i18n("midi-qol.PreferredGM.Name"),
    hint: i18n("midi-qol.PreferredGM.Hint"),
    scope: "world",
    default: "",
    config: false,
    type: String
  });

  game.settings.register("midi-qol", "ReplaceDefaultActivities", {
    name: i18n("midi-qol.ReplaceDefaultActivities.Name"),
    hint: i18n("midi-qol.ReplaceDefaultActivities.Hint"),
    scope: "world",
    default: true,
    config: true,
    type: Boolean,
    requiresReload: true
  });

  // Deprecated: kept for one version cycle to allow migration of old value into configSettings arrays
  game.settings.register("midi-qol", "AutoFastForwardAbilityRolls", {
    name: i18n("midi-qol.AutoFastForwardAbilityRolls.Name"),
    hint: i18n("midi-qol.AutoFastForwardAbilityRolls.Hint"),
    scope: "world",
    default: false,
    type: Boolean,
    config: false,
  });

  game.settings.register("midi-qol", "showGM", {
    name: i18n("midi-qol.showGM.Name"),
    hint: i18n("midi-qol.showGM.Hint"),
    scope: "world",
    default: false,
    type: Boolean,
    config: true,
    onChange: fetchParams
  });
  
  game.settings.register("midi-qol", "ForceHideRoll", {
    name: i18n("midi-qol.ForceHideRoll.Name"),
    hint: i18n("midi-qol.ForceHideRoll.Hint"),
    scope: "client",
    default: true,
    type: Boolean,
    config: true,
    onChange: fetchParams,
    requiresReload: true
  });

  game.settings.register("midi-qol", "DragDropTarget", {
    name: i18n("midi-qol.DragDropTarget.Name"),
    hint: i18n("midi-qol.DragDropTarget.Hint"),
    scope: "world",
    default: false,
    type: Boolean,
    onChange: fetchParams,
    config: true
  });

  // Deprecated: CriticalDamage/CriticalDamageGM have moved to configSettings (shown on Workflow > Damage tab)
  // Kept registered for migration from old setting values
  game.settings.register("midi-qol", "CriticalDamageGM", {
    name: "midi-qol.CriticalDamageGM.Name",
    scope: "world",
    default: "none",
    type: String,
    config: false,
    choices: criticalDamageChoices,
    onChange: fetchParams
  });
  game.settings.register("midi-qol", "CriticalDamage", {
    name: "midi-qol.CriticalDamage.Name",
    scope: "world",
    default: "default",
    type: String,
    config: false,
    choices: criticalDamageChoices,
    onChange: fetchParams
  });

  // Deprecated: ColoredBorders has moved to configSettings.coloredBorders (shown on Misc tab)
  // Kept registered for migration from old setting value
  game.settings.register("midi-qol", "ColoredBorders",
    {
      name: "midi-qol.ColoredBorders.Name",
      hint: "midi-qol.ColoredBorders.Hint",
      scope: "world",
      default: "None",
      type: String,
      config: false,
      choices: coloredBordersOptions,
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

  game.settings.registerMenu("midi-qol", "resetSettings", {
    name: i18n("midi-qol.ResetDefaults.Name"),
    label: "midi-qol.ResetDefaults.Button",
    hint: i18n("midi-qol.ResetDefaults.Hint"),
    icon: "fas fa-triangle-exclamation",
    type: ResetSettingsSubmenu,
    restricted: true
  });

  // Register wizard launcher if the wizard module is installed and active
  if (game.modules.get("midi-qol-setup-wizard")?.active) {
    game.settings.registerMenu("midi-qol", "launchSetupWizard", {
      name: i18n("midi-qol.LaunchSetupWizard.Name"),
      label: "midi-qol.LaunchSetupWizard.Label",
      hint: i18n("midi-qol.LaunchSetupWizard.Hint"),
      icon: "fas fa-magic",
      type: LaunchWizardSubmenu,
      restricted: true
    });
  }

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

  game.settings.registerMenu("midi-qol", "showRollStats", {
    name: i18n("midi-qol.ShowStats"),
    label: "midi-qol.ShowStats",
    hint: i18n("midi-qol.KeepRollStats.Hint"),
    icon: "fas fa-chart-bar",
    type: RollStatsDisplay as any,
    restricted: false
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

  game.settings.register("midi-qol", "UseWeakReferences", {
    name: "Use Weak References for Workflows",
    hint: "Use WeakReferences to store workflows - should save some memory. A workflow that is dropped is rebuilt from its chat card when needed.",
    scope: "world",
    default: false,
    type: Boolean,
    config: true,
    onChange: fetchParams
  });

  game.settings.registerMenu("midi-qol", "dependentsExplorer", {
    name: i18n("midi-qol.DependentsExplorer.Name"),
    label: "midi-qol.DependentsExplorer.Label",
    icon: "fas fa-sitemap",
    hint: i18n("midi-qol.DependentsExplorer.Hint"),
    type: DependentsExplorer as any,
    restricted: true
  });

  // Hide the Dependents Explorer button for non-GM clients
  Hooks.on("renderSettingsConfig", (app, html) => {
    if (game.user?.isGM) return;
    const element = html instanceof HTMLElement ? html : html[0];
    if (!element) return;
    const menuButton = element.querySelector('[data-key="midi-qol.dependentsExplorer"]');
    if (menuButton) {
      const formGroup = menuButton.closest(".form-group");
      if (formGroup) {
        (formGroup as HTMLElement).style.display = "none";
      }
    }
  });

  game.settings.registerMenu("midi-qol", "troubleShooter", {
    name: i18n("midi-qol.TroubleShooter.Name"),
    label: "midi-qol.TroubleShooter.Label",
    icon: "fas fa-wrench",
    hint: i18n("midi-qol.TroubleShooter.Hint"),
    // icon: "fas fa-dice-d20",
    type: TroubleShooter,
    restricted: false
  });
}

export function safeGetGameSetting(moduleName: string, settingName: string): any | undefined {
  // @ts-expect-error
  if (game.settings.settings.get(`${moduleName}.${settingName}`))
    //@ts-expect-error
    return game.settings.get(moduleName, settingName);
  else return undefined;
}

// Setter companion to safeGetGameSetting — sets only registered settings, and accepts loose key names
// (fvtt-types' KeyFor<"core"> lags v14, e.g. "messageMode"). Returns the set promise or undefined.
export function safeSetGameSetting(moduleName: string, settingName: string, value: unknown): Promise<unknown> | undefined {
  // @ts-expect-error
  if (game.settings.settings.get(`${moduleName}.${settingName}`))
    //@ts-expect-error
    return game.settings.set(moduleName, settingName, value);
  else return undefined;
}

/**
 * Helper to check if save DCs should be displayed, based on dnd5e's challengeVisibility setting.
 * Replaces the deprecated midi-qol displaySaveDC setting.
 * @param actor Optional actor to check ownership for "player" visibility setting.
 *              When visibility is "player", DC is only shown if the actor has player ownership.
 * @returns true if DCs should be shown, false if hidden
 */
export function shouldDisplaySaveDC(actor?: Actor): boolean {
  const visibility = safeGetGameSetting("dnd5e", "challengeVisibility");
  if (visibility === "none") return false;
  if (visibility === "all") return true;
  // "player" - only show DC if actor is player-owned (or no actor specified for backwards compat)
  return !actor || (actor as any).hasPlayerOwner;
}
