export declare let itemRollButtons: boolean;
export declare let criticalDamage: string;
export declare let criticalDamageGM: string;
export declare let nsaFlag: boolean;
export declare let coloredBorders: string;
export declare let saveRequests: {};
export declare let saveTimeouts: {};
export declare let addChatDamageButtonsOld: string;
export declare let autoFastForwardAbilityRolls: boolean;
export declare let autoRemoveTargets: string;
export declare let forceHideRoll: boolean;
export declare let enableWorkflow: boolean;
export declare let dragDropTargeting: boolean;
export declare let targetConfirmation: typeof defaultTargetConfirmationSettings;
export declare let midiSoundSettings: any;
export declare let midiSoundSettingsBackup: any;
export declare let DebounceInterval: number;
export declare let ReplaceDefaultActivities: boolean;
export declare let UseWeakReferences: boolean;
export declare let SaveToChatCard: boolean;
export declare const defaultTargetConfirmationSettings: {
    enabled: boolean;
    always: boolean;
    noneTargeted: boolean;
    hasAttack: boolean;
    hasCreatureTarget: boolean;
    targetSelf: boolean;
    hasAoE: boolean;
    hasRangedAoE: boolean;
    longRange: boolean;
    inCover: boolean;
    allies: boolean;
    mixedDisposition: boolean;
    gridPosition: {
        x: number;
        y: number;
    };
};
declare class ConfigSettings {
    addChatDamageButtons: string;
    addDead: string;
    addFakeDice: boolean;
    addWounded: number;
    addWoundedStyle: string;
    activityNamePrefix: boolean;
    activationAutomation: string;
    midiWoundedCondition: string;
    midiDeadCondition: string;
    midiUnconsciousCondition: string;
    allowUseMacro: boolean;
    allowActorUseMacro: boolean;
    attackPerTarget: boolean;
    autoApplyDamage: string;
    playerDamageCard: string;
    playerCardDamageDifferent: boolean;
    hidePlayerDamageCard: boolean;
    autoCEEffects: string;
    autoCheckHit: string;
    autoCheckSaves: string;
    autoFastForward: string;
    autoItemEffects: string;
    autoRemoveSummonedCreature: boolean;
    autoRemoveTemplate: boolean;
    autoRemoveInstantaneousTemplate: boolean;
    autoRollAttack: boolean;
    autoRollDamage: string;
    autoCompleteWorkflow: boolean;
    saveDROrder: string;
    autoTarget: string;
    averageDamage: string;
    checkSaveText: boolean;
    checkTwoHanded: boolean;
    chooseAmmunition: boolean;
    collapsibleTargets: boolean;
    concentrationAutomation: boolean;
    confirmAmmunition: boolean;
    gmConfirmAmmunition: boolean;
    consumeResource: string;
    convenientEffectsReaction: string;
    criticalSound: string;
    customSoundsPlaylist: string;
    damageImmunities: string;
    damageImmunityMultiplier: number;
    damageResistanceMultiplier: number;
    damageVulnerabilityMultiplier: number;
    defaultSaveMultiplier: number;
    diceSound: string;
    displayHitResultNumeric: boolean;
    displaySaveAdvantage: boolean;
    displaySaveDC: boolean;
    doConcentrationCheck: string;
    griddedGridless: boolean;
    gridlessFudge: number | undefined;
    doReactions: string;
    effectActivation: boolean;
    enableDDBGL: boolean;
    enforceReactions: string;
    enforceBonusActions: string;
    enforceSingleWeaponTarget: boolean;
    fixStickyKeys: boolean;
    fumbleSound: string;
    ghostRolls: boolean;
    gmAutoAttack: boolean;
    gmAutoDamage: string;
    gmAutoFastForwardAttack: boolean;
    gmAutoFastForwardDamage: boolean;
    gmConsumeResource: string;
    gmDoReactions: string;
    gmHide3dDice: boolean;
    gmLateTargeting: string;
    gmRemoveButtons: string;
    gmAttackDamageCards: boolean;
    hideRollDetails: string;
    ignoreSpellReactionRestriction: boolean;
    itemRollStartWorkflow: boolean;
    itemTypeList: string[] | undefined;
    itemUseSound: string;
    keepRollStats: boolean;
    keyMapping: {
        "DND5E.Advantage": string;
        "DND5E.Disadvantage": string;
        "DND5E.Critical": string;
        "DND5E.Versatile": string;
    };
    mergeCardCondensed: boolean;
    mergeCardMulti: boolean;
    mergeCardMultiDamage: boolean;
    displayProperties: boolean;
    midiPropertiesTabRole: number;
    confirmAttackDamage: string;
    highlightSuccess: boolean;
    highLightCriticalAttackOnly: boolean;
    markPlayerDefeated: boolean;
    markNonPlayerDefeated: boolean;
    optionalRulesEnabled: boolean;
    paranoidGM: boolean;
    playerRollSaves: string;
    playerSaveTimeout: number;
    playerStatsOnly: boolean;
    potionUseSound: string;
    quickSettings: boolean;
    rangeTarget: string;
    useTemplateRangedTargeting: boolean;
    reactionTimeout: number;
    recordAOO: string;
    removeButtons: string;
    removeConcentration: boolean;
    removeConcentrationEffects: string;
    playerRequireAmmunition: boolean;
    gmRequireAmmunition: boolean;
    requireMagical: string;
    requiresTargets: string;
    rollNPCLinkedSaves: string;
    rollNPCSaves: string;
    rollChecksBlind: string[];
    rollSavesBlind: string[];
    rollSkillsBlind: string[];
    saveStatsEvery: number;
    showDSN: boolean;
    showFastForward: boolean;
    showItemDetails: string;
    showReactionAttackRoll: string;
    showReactionChatMessage: boolean;
    singleConcentrationRoll: boolean;
    skillAbilityCheckAdvantage: boolean;
    spellHitSound: string;
    spellUseSound: string;
    spellUseSoundRanged: string;
    tempHPDamageConcentrationCheck: boolean;
    concentrationIncapacitatedConditionCheck: boolean;
    toggleOptionalRules: boolean;
    useCustomSounds: boolean;
    usePlayerPortrait: boolean;
    useTokenNames: boolean;
    undoChatColor: string;
    undoWorkflow: boolean;
    useDamageDetail: boolean;
    weaponHitSound: string;
    weaponUseSound: string;
    weaponUseSoundRanged: string;
    rollAlternate: string;
    optionalRules: {
        actionSpecialDurationImmediate: boolean;
        activeDefence: boolean;
        activeDefenceShow: string;
        autoRerollInitiative: boolean;
        challengeModeArmor: string;
        checkFlanking: string;
        checkRange: string;
        coverCalculation: string;
        criticalNat20: boolean;
        criticalSaves: boolean;
        displayBonusRolls: boolean;
        distanceIncludesHeight: boolean;
        DRAllPerDamageDetail: boolean;
        hiddenAdvantage: string;
        incapacitated: string;
        invisAdvantage: string;
        invisVision: boolean;
        maxDRValue: boolean;
        nearbyAllyRanged: number;
        nearbyFoe: number;
        optionalCritRule: number;
        removeHiddenInvis: boolean;
        vitalityResource: string;
        wallsBlockRange: string;
    };
}
export declare let configSettings: ConfigSettings;
export declare function checkMechanic(mechanic: keyof (typeof configSettings.optionalRules)): string | number | boolean;
export declare function checkRule(rule: keyof (typeof configSettings.optionalRules)): string | number | boolean;
export declare const checkedModuleList: (string | RegExp)[];
export declare const CheckedAuthorsList: string[];
export declare function collectSettingData(): {
    configSettings: ConfigSettings;
    midiSoundSettings: any;
    itemRollButtons: boolean;
    criticalDamage: string;
    criticalDamageGM: string;
    nsaFlag: boolean;
    coloredBorders: string;
    autoFastForwardAbilityRolls: boolean;
    autoRemoveTargets: string;
    forceHideRoll: boolean;
    enableWorkflow: boolean;
    dragDropTargeting: boolean;
    DebounceInterval: number;
    targetConfirmation: {
        enabled: boolean;
        always: boolean;
        noneTargeted: boolean;
        hasAttack: boolean;
        hasCreatureTarget: boolean;
        targetSelf: boolean;
        hasAoE: boolean;
        hasRangedAoE: boolean;
        longRange: boolean;
        inCover: boolean;
        allies: boolean;
        mixedDisposition: boolean;
        gridPosition: {
            x: number;
            y: number;
        };
    };
    flags: {};
};
export declare function exportSettingsToJSON(): void;
export declare function importSettingsFromJSON(json: any): Promise<void>;
export declare let fetchSoundSettings: () => void;
export declare let fetchParams: () => void;
export declare function readySettingsSetup(): void;
export declare const criticalDamageChoices: {
    [k: string]: string;
};
export declare const addChatDamageButtonsOptions: {
    [k: string]: string;
};
export declare const coloredBordersOptions: {
    [k: string]: string;
};
export declare const autoRemoveTargetsOptions: {
    [k: string]: string;
};
export declare const debugOptions: {
    [k: string]: string;
};
export declare const autoRollDamageOptions: {
    [k: string]: string;
};
export declare const autoCheckHitOptions: {
    [k: string]: string;
};
export declare const clickOptions: {
    [k: string]: string;
};
export declare const autoTargetOptions: {
    [k: string]: string;
};
export declare const autoCheckSavesOptions: {
    [k: string]: string;
};
export declare const rangeTargetOptions: {
    [k: string]: string;
};
export declare const autoApplyDamageOptions: {
    [k: string]: string;
};
export declare const playerDamageCardOptions: {
    [k: string]: string;
};
export declare const removeButtonsOptions: {
    [k: string]: string;
};
export declare const damageImmunitiesOptions: {
    [k: string]: string;
};
export declare const showItemDetailsOptions: {
    [k: string]: string;
};
export declare const rollNPCSavesOptions: {
    [k: string]: string;
};
export declare const playerRollSavesOptions: {
    [k: string]: string;
};
export declare const playerRollSavesOptionsReduced: {
    [k: string]: string;
};
export declare const hideRollDetailsOptions: {
    [k: string]: string;
};
export declare const rollOtherDamageOptions: {
    [k: string]: string;
};
export declare const showReactionAttackRollOptions: {
    [k: string]: string;
};
export declare const onUseMacroOptions: {
    [k: string]: string;
};
export declare const confirmTargetOptions: {
    [k: string]: string;
};
export declare const triggeredActivityTargetOptions: {
    [k: string]: string;
};
export declare const triggeredActivityRollAsOptions: {
    [k: string]: string;
};
export declare const ignoreTraitsOptions: {
    idi: {
        label: string;
        hint: string;
    };
    idr: {
        label: string;
        hint: string;
    };
    idv: {
        label: string;
        hint: string;
    };
    ida: {
        label: string;
        hint: string;
    };
    idm: {
        label: string;
        hint: string;
    };
};
export declare const aoeTargetTypeOptions: {
    [k: string]: string;
};
export declare const autoCEEffectsOptions: {
    [k: string]: string;
};
export declare const wallsBlockRangeOptionsNew: {
    [k: string]: string;
};
export declare const coverCalculationOptions: {
    [k: string]: string;
};
export declare const hiddenAdvantageOptions: {
    [k: string]: string;
};
export declare const addDeadOptions: {
    [k: string]: string;
};
export declare const quickSettingsBlurb: {
    [k: string]: string;
};
export declare const requiresTargetsOptions: {
    [k: string]: string;
};
export declare const doReactionsOptions: {
    [k: string]: string;
};
export declare const gmDoReactionsOptions: {
    [k: string]: string;
};
export declare const recordAOOOptions: {
    [k: string]: string;
};
export declare const EnforceReactionsOptions: {
    [k: string]: string;
};
export declare const autoEffectsOptions: {
    [k: string]: string;
};
export declare const requireMagicalOptions: {
    [k: string]: string;
};
export declare const checkFlankingOptions: {
    [k: string]: string;
};
export declare const hideRollDetailsHintLongOptions: {
    [k: string]: string;
};
export declare const rollAlternateOptions: {
    [k: string]: string;
};
export declare const consumeResourceOptions: {
    [k: string]: string;
};
export declare const averageDamageOptions: {
    [k: string]: string;
};
export declare const removeConcentrationEffectsOptions: {
    [k: string]: string;
};
export declare const incapacitatedOptions: {
    [k: string]: string;
};
export declare const checkRangeOptions: {
    [k: string]: string;
};
export declare const invisAdvantageOptions: {
    [k: string]: string;
};
export declare const confirmAttackDamageOptions: {
    [k: string]: string;
};
export declare const challengeModeArmorOptions: {
    [k: string]: string;
};
export declare const saveDROrderOptions: {
    [k: string]: string;
};
export declare const doConcentrationCheckOptions: {
    [k: string]: string;
};
export declare const activationAutomationOptions: {
    [k: string]: string;
};
export declare const soundSettingsBlurb: {
    [k: string]: string;
};
export declare const registerSettings: () => void;
export declare function disableWorkflowAutomation(): void;
export declare function safeGetGameSetting(moduleName: string, settingName: string): any | undefined;
export {};
