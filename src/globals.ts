import { AnyMutableObject, AnyObject, InexactPartial } from "fvtt-types/utils";
import { OnUseMacros } from "./module/apps/Item";
import { DamageDescriptionObject, DamageOnlyWorkflow, DDBGameLogWorkflow, DummyWorkflow, TrapWorkflow, UndoData, UserWorkflow, Workflow, WorkflowOptions, WorkflowRollOptions } from "./module/Workflow";
import { MidiOptions } from "./module/utils";
import * as utils from "./module/utils";
import * as settings from "./module/settings";
import { RollStats, Stats } from "./module/RollStats";
import { checkRule, configSettings, targetConfirmation } from "./module/settings";
import { SaferSocket, SerializedDamageListEntry } from "./module/GMAction";
import { MidiActivityMixin } from "./module/activities/MidiActivityMixin";
import * as undo from "./module/undo";
import { ConfigPanel } from "./module/apps/ConfigPanel";
import { createEffects, debug, log, moveToken, moveTokenAwayFromPoint, removeEffects, updateEffects, warn } from "./midi-qol";
import { TargetConfirmationDialog } from "./module/apps/TargetConfirmation";
import { MidiSounds } from "./module/midi-sounds";
import { resolveTargetConfirmation, templateTokens } from "./module/activities/activityHelpers";
import { showUndoWorkflowApp } from "./module/apps/UndoWorkflow";
import { TroubleShooter } from "./module/apps/TroubleShooter";

declare module "fvtt-types/configuration" {
  interface AssumeHookRan {
    init: never;
  }
  namespace Hooks {
    interface HookConfig {
      "dae.addSpecialDurations": (daeSpecialDurations: Record<string, string>) => void;
      "dae.setFieldData": (fieldData: Record<string, string[]>) => void;
      "dnd5e.activityConsumption": (activity: Activity, usageConfig: ActivityUseConfiguration, messageConfig: RollMessageConfig, updates: unknown) => boolean | void;
      "dnd5e.applyDamage": (actor: Actor.Implementation, amount: number, options: DamageApplicationOptions) => void;
      "dnd5e.calculateDamage": (actor: Actor.Implementation, damages: DamageDescription[], options: DamageApplicationOptions) => boolean | void;
      "dnd5e.postAbilityCheckRollConfiguration": (rolls: Roll[], config: RollProcessConfig, dialog: RollDialogConfig, message: RollMessageConfig) => boolean | void;
      "dnd5e.postAttackRollConfiguration": (rolls: Roll[], config: RollProcessConfig, dialog: RollDialogConfig, message: RollMessageConfig) => boolean | void;
      "dnd5e.postBuildSkillRollConfig": (process: RollProcessConfig, config: BasicRollConfig, index: number) => void;
      "dnd5e.postSavingThrowRollConfiguration": (rolls: Roll[], config: RollProcessConfig, dialog: RollDialogConfig, message: RollMessageConfig) => boolean | void;
      "dnd5e.postSkillRollConfiguration": (rolls: Roll[], config: RollProcessConfig, dialog: RollDialogConfig, message: RollMessageConfig) => boolean | void;
      "dnd5e.postSummon": (activity: Activity, profile: unknown, tokens: foundry.canvas.placeables.Token.Implementation[], options: unknown) => void;
      "dnd5e.postUseLinkedSpell": (activity: Activity, usageConfig: ActivityUseConfiguration, results: unknown) => void;
      "dnd5e.preActivityConsumption": (activity: Activity, usageConfig: ActivityUseConfiguration, messageConfig: RollMessageConfig) => boolean | void;
      "dnd5e.preApplyDamage": (actor: Actor.Implementation, amount: number, updates: Actor.UpdateData, options: DamageApplicationOptions) => boolean | void;
      "dnd5e.preCalculateDamage": (actor: Actor.Implementation, damages: DamageDescription[], options: DamageApplicationOptions) => boolean | void;
      "dnd5e.preConfigureInitiative": (actor: Actor.Implementation, rollConfig: { data: AnyMutableObject, parts: string[], options: D20RollOptions }) => void;
      "dnd5e.preCreateActivityTemplate": (activity: Activity, templateData: MeasuredTemplateDocument.CreateData) => boolean | void;
      "dnd5e.preRollAbilityCheck": (config: RollProcessConfig, dialog: RollDialogConfig, message: RollMessageConfig) => boolean | void;
      "dnd5e.preRollAbilityCheckV2": (config: RollProcessConfig, dialog: RollDialogConfig, message: RollMessageConfig) => boolean | void;
      "dnd5e.preRollAttack": (rollConfig: RollProcessConfig & {attackMode: string}, dialogConfig: RollDialogConfig, messageConfig: RollMessageConfig) => boolean | void;
      "dnd5e.preRollConcentrationV2": (config: RollProcessConfig, dialog: RollDialogConfig, message: RollMessageConfig) => boolean | void;
      "dnd5e.preRollDamageV2": (config: RollProcessConfig, dialog: RollDialogConfig, message: RollMessageConfig) => boolean | void;
      "dnd5e.preRollDeathSave": (config: RollProcessConfig, dialog: RollDialogConfig, message: RollMessageConfig) => boolean | void;
      "dnd5e.preRollSavingThrow": (config: RollProcessConfig, dialog: RollDialogConfig, message: RollMessageConfig) => boolean | void;
      "dnd5e.preRollSkill": (config: RollProcessConfig, dialog: RollDialogConfig, message: RollMessageConfig) => boolean | void;
      "dnd5e.preRollTool": (config: RollProcessConfig, dialog: RollDialogConfig, message: RollMessageConfig) => boolean | void;
      "dnd5e.preUseActivity": (activity: Activity, usageConfig: AnyMutableObject, dialogConfig: AnyMutableObject, messageConfig: AnyMutableObject) => boolean | void;
      "dnd5e.restCompleted": (actor: Actor.Implementation, result: {longRest: boolean; newDay: boolean}, config: unknown) => void;
      "dnd5e.rollAttack": (rolls: Roll[], data: { subject: Activity | null, ammoUpdate: {id: string, destroy: boolean; quantity: number} | null}) => void;
      "dnd5e.rollConcentrationV2": (rolls: Roll[], data: { subject?: Actor.Implementation }) => void;
      "dnd5e.rollDamageV2": (rolls: Roll[], data?: { subject?: Activity }) => void;
      "dnd5e.rollDeathSave": (rolls: Roll[], data: {chatString: string; updates: Actor.UpdateData; subject: Actor.Implementation}) => boolean | void;
      "midi-qol.ConfigSettingsChanged": () => void;
      "midi-qol.RollComplete": (workflow: Workflow) => Promise<void>;
      "midi-qol.dnd5ePreCalculateDamage": (actor: Actor.Implementation, damages: DamageDescription[], options: DamageApplicationOptions) => boolean | void;
      "midi-qol.dnd5eCalculateDamage": (actor: Actor.Implementation, damages: DamageDescription[], options: DamageApplicationOptions) => void;
      "midi-qol.preItemRoll": (workflow: Workflow) => Promise<void | boolean>;
      "midi-qol.preAttackRoll": (workflow: Workflow) => Promise<void | boolean>;
      "midi-qol.AttackRollComplete": (workflow: Workflow) => Promise<void | boolean>;
      "midi-qol.DamageRollComplete": (workflow: Workflow) => Promise<void | boolean>;
      "midi-qol.StatsUpdated": () => void;
      "midi-qol.addUndoEntry": (data: UndoData) => void;
      "midi-qol.midiReady": () => void;
      "midi-qol.ready": () => void;
      "midi-qol.removeUndoEntry": (data?: UndoData) => void;
      "midi-qol.setup": (data: typeof globalThis.MidiQOL) => void;
    }
  }
  interface SettingConfig {
    "dnd5e.disableConcentration": boolean;
    "dnd5e.metricLengthUnits": boolean;
    "midi-qol.MidiSoundSettings": Record<string, any>;
    "midi-qol.playerControlsInvisibleTokens": boolean;
    "midi-qol.RollStats": Record<string, Stats>;
    "midi-qol.ConfigSettings": typeof configSettings;
    "midi-qol.CriticalDamage": string;
    "midi-qol.CriticalDamageGM": string;
    "midi-qol.showGM": boolean;
    "midi-qol.ColoredBorders": string;
    "midi-qol.AutoFastForwardAbilityRolls": boolean;
    "midi-qol.AutoRemoveTargets": string;
    "midi-qol.ForceHideRoll": boolean;
    "midi-qol.EnableWorkflow": boolean;
    "midi-qol.DragDropTarget": boolean;
    "midi-qol.DebounceInterval": number;
    "midi-qol.TargetConfirmation": typeof targetConfirmation;
    "midi-qol.Debug": string;
    "midi-qol.ReplaceDefaultActivities": boolean;
    "midi-qol.UseWeakReferences": boolean;
    "midi-qol.SaveToChatCard": boolean;
    "midi-qol.PreferredGM": string;
    "midi-qol.MidiSoundSettings-backup": Record<string, any>;
    "midi-qol.LateTargeting": string;
    "midi-qol.notificationVersion": string;
    "midi-qol.splashWarnings": boolean;
    "midi-qol.last-run-version": string;
    "midi-qol.instanceId": string;
  }
  interface FlagConfig {
    ActiveEffect: {
      ActiveAuras?: {
        isAura?: boolean;
        ignoreSelf?: boolean;
      }
      dnd5e?: {
        dependents?: {
          uuid: string;
        }[];
        itemUuid?: string;
        item?: {
          type: string;
          id: string;
          uuid: string;
        }
      };
      // Copied from DAE's `globals.ts` for now
      dae?: {
        activity?: string;
        activityMacro?: string;
        autoCreated?: boolean;
        disableIncapacitated?: boolean;
        dontApply?: boolean;
        durationExpression?: string;
        enableCondition?: string;
        itemData?: Item.InitializedData;
        itemMacro?: string;
        itemUuid?: string;
        itemsToDelete?: string[];
        selfTarget?: boolean;
        selfTargetAlways?: boolean;
        showIcon?: boolean;
        specialDuration?: string | string[];
        stackable?: "noneName" | "noneNameOnly" | "none" | "multi" | "count" | "countDeleteDecrement";
        stacks?: number;
        transfer?: boolean;
      };
      "midi-qol"?: {
        actionSaveSuccess?: boolean;
        castData?: {
          castLevel?: number;
          baseLevel?: number;
        };
        overtimeChatCardUuids?: string[];
      };
    };
    Actor: {
      dnd5e?: {
        // added by us
        DamageBonusMacro?: string;
        // added by us
        spellSniper?: boolean;
        // added by us
        sharpShooter?: string;
      };
      "midi-qol"?: {
        actions?: {
          reaction?: boolean;
          action?: boolean;
          bonus?: boolean;
          reactionCombatRound?: number;
        };
        acBonus?: number;
        advantage?: {
          ability?: {
            all?: string;
            check?: Record<string, string>;
            save?: Record<string, string>;
          };
          all?: string;
          attack?: Record<string, string>;
          concentration?: string;
          deathSave?: string;
          skill?: Record<string, string>;
        };
        carefulSpells?: boolean;
        concentrationSaveBonus?: number;
        critical?: Record<string, string>;
        damage?: {
          advantage?: boolean;
          "reroll-kh"?: boolean;
          "reroll-kl"?: boolean;
        };
        deathSaveBonus?: number;
        disadvantage?: {
          ability?: {
            all?: string;
            check?: Record<string, string>;
            save?: Record<string, string>;
          };
          all?: string;
          attack?: Record<string, string>;
          concentration?: string;
          deathSave?: string;
          skill?: Record<string, string>;
        };
        fail?: {
          ability?: {
            all?: string;
            check?: Record<string, string>;
            save?: Record<string, string>;
          };
          all?: string;
          attack?: Record<string, string>;
          critical?: Record<string, string>;
          disadvantage?: {
            heavy?: boolean;
          };
          skill?: Record<string, string>;
          spell?: {
            all?: string;
            verbal?: string;
            vocal?: string;
            somatic?: string;
            material?: string;
          };
        };
        grants?: {
          advantage?: {
            all?: string;
            attack?: Record<string, string>;
            check?: Record<string, string>;
            save?: Record<string, string>;
            skill?: Record<string, string>;
          };
          attack?: {
            bonus?: Record<string, string>;
            fail?: {
              all?: string;
            }
            success?: Record<string, string>;
          };
          bonus?: {
            damage?: Record<string, string>
          };
          critical?: Record<string, string>;
          criticalThreshold?: string;
          disadvantage?: {
            all?: string;
            attack?: Record<string, string>;
            check?: Record<string, string>;
            save?: Record<string, string>;
            skill?: Record<string, string>;
          };
          fail?: {
            advantage?: {
              attack?: Record<string, string>;
            };
            disadvantage?: {
              attack?: Record<string, string>;
            };
          };
          max?: {
            damage?: Record<string, string>;
          };
          min?: {
            damage?: Record<string, string>;
          };
          noAdvantage?: {
            attack?: Record<string, string>;
          };
          noCritical?: Record<string, string>;
          noDisadvantage?: {
            attack?: Record<string, string>;
          };
        };
        ignoreCover?: boolean;
        ignoreNearbyFoes?: boolean;
        ignoreWalls?: boolean;
        inMotion?: boolean;
        long?: Record<string, string>;
        magicResistance?: {
          check?: { all?: string };
          save?: { all?: string };
          skill?: { all?: string };
        } & Record<string, string>;
        magicVulnerability?: Record<string, string>;
        max?: {
          ability?: {
            all?: string;
            check?: Record<string, string>;
            save?: Record<string, string>;
          }
          damage?: Record<string, string>;
          skill?: {
            all?: string;
          };
        };
        min?: {
          ability?: {
            all?: string;
            check?: Record<string, string>;
            save?: Record<string, string>;
          }
          damage?: Record<string, string>;
          skill?: {
            all?: string;
          }
        };
        neverTarget?: boolean;
        noAdvantage?: {
          attack?: {
            all?: string;
          };
        };
        noCritical?: Record<string, string>;
        onUseMacroName?: string;
        onUseMacroParts?: OnUseMacros;
        optional?: Record<string, any>;
        OverTime?: string;
        potentCantrip?: boolean;
        range?: Record<string, string>;
        rangeOverride?: {
          attack?: Record<string, string>;
        };
        rollModifiers?: {
          attack?: Record<string, string>;
          damage?: Record<string, Record<string, string>>;
        }
        sculptSpells?: boolean;
        semiSuperSaver?: Record<string, string>;
        sharpShooter?: string;
        success?: {
          all?: boolean;
          attack?: Record<string, string>;
        };
        superSaver?: Record<string, string>;
        uncannyDodge?: boolean;
      };
    };
    ChatMessage: {
      dnd5e?: {
        item?: {
          id: string;
          type: string;
          uuid: string;
          data?: Item.CreateData;
        };
        scaling?: number;
        "use.concentrationId"?: string;
        "use.spellLevel"?: number;
        "use.consumed"?: unknown;
        targets?: unknown;
        messageType?: string;
        roll?: {
          type?: string;
          itemId?: string;
        };
      };
      "midi-qol"?: {
        activityUuid?: string;
        actorUuid?: string;
        sourceActorUuid?: string;
        advantageSaveUuids?: string[];
        advReminderAttackAdvAttribution?: string[];
        ammunitionOnUseMacros?: OnUseMacros;
        AoO?: boolean;
        attackAdvAttribution?: string[];
        attackTotal?: number;
        attackRoll?: Roll.Data;
        attackRollCount?: number;
        bonusDamageRolls?: Roll.Data[];
        bonusDamageTotal?: number;
        concentrationRolled?: boolean;
        criticalSaveUuids?: string[];
        currentAction?: [string, string];
        d20AttackRoll?: number;
        damageList?: DamageListEntry[];
        damageRollCount?: number;
        damageRolls?: Roll.Data[];
        damageTotal?: number;
        defaultDamageType?: string;
        diceRoll?: number;
        effectsAlreadyExpired?: string[];
        extraRolls?: Roll.Data[];
        failedSaveUuids?: string[];
        fumbleSaveUuids?: string[];
        hitTargetUuids?: string[];
        hitECTargetUuids?: string[];
        inCombat?: boolean;
        isCritical?: boolean;
        isFumble?: boolean;
        itemUseComplete?: boolean;
        needTemplate?: boolean;
        noOptionalRules?: boolean;
        OnUseMacros?: OnUseMacros;
        otherDamageRolls?: Roll.Data[];
        otherDamageTotal?: number;
        rawBonusDamageDetail?: DamageDescriptionObject[];
        rawDamageDetail?: DamageDescriptionObject[];
        rawOtherDamageDetail?: DamageDescriptionObject[];
        saveDisplayData?: unknown;
        saveRolls?: {
          formula: string;
          options: Roll.Options;
        }[];
        saveUuids?: string[];
        semiSuperSaverUuids?: string[];
        superSaverUuids?: string[];
        suspended?: boolean;
        targetUuids?: string[];
        targetsCanSeeUuids?: string[];
        targetsCanSenseUuids?: string[];
        tokenCanSeeUuids?: string[];
        tokenCanSenseUuids?: string[];
        attackingTokenUuid?: string;
        templateUuid?: string;
        workflowOptions?: WorkflowOptions;
        undoDamage?: SerializedDamageListEntry[];
        utilityRolls?: Roll.Data[];
        aborted?: boolean;
        type?: number;
        overtimeActorUuid?: string;
        messageType?: string;
        roll?: unknown[];
        damageDetail?: DamageDescriptionObject[];
        syntheticItem?: boolean;
        isHit?: boolean;
      };
    };
    Item: {
      dnd5e?: {
        scaling?: number;
        spellLevel?: {
          base?: number;
          value?: number;
        };
        riders?: {
          activity?: string[];
        }
      };
      "midi-qol"?: {
        onUseMacroParts?: OnUseMacros;
        onUseMacroName?: string;
        noProvokeReaction?: boolean;
        isConcentrationCheck?: boolean;
        trapWorkflow?: {
          ignoreSelf?: boolean;
        }
      };
      dae?: {
        macro?: Macro.CreateData;
      };
      itemacro?: {
        macro?: Macro.CreateData;
      };
    };
    MeasuredTemplate: {
      dnd5e?: {
        origin?: string;
      };
      "midi-qol"?: {
        itemUuid?: string;
        actorUuid?: string;
        activityUuid?: string;
        workflowId?: string;
        itemCardUuid?: string;
      };
    };
  }
};

declare global {
  // Note: Intentional `var` use here to add to the `globalThis`
  var MidiDAEEval: {
    testfunc: (...args: any[]) => void;
    canSee: typeof utils.canSee;
    canSense: typeof utils.canSense;
    canSenseModes: typeof utils.canSenseModes;
    checkIncapacitated: typeof utils.checkIncapacitated;
    checkDistance: typeof utils.checkDistance;
    checkNearby: typeof utils.checkNearby;
    checkActivityRange: typeof utils.checkActivityRange;
    checkRule: typeof checkRule;
    computeCoverBonus: typeof utils.computeCoverBonus;
    computeDistance: typeof utils.computeDistance;
    contestedRoll: typeof utils.contestedRoll;
    displayDSNForRoll: typeof utils.displayDSNForRoll;
    doConcentrationCheck: typeof utils.doConcentrationCheck;
    chooseEffect: typeof utils.chooseEffect;
    findNearby: typeof utils.findNearby;
    findNearbyCount: typeof utils.findNearbyCount;
    getTraitMult: typeof utils.getTraitMult,
    hasCondition: typeof utils.hasCondition;
    hasUsedBonusAction: typeof utils.hasUsedBonusAction;
    hasUsedReaction: typeof utils.hasUsedReaction;
    humanoid: string[];
    isTargetable: typeof utils.isValidTarget,
    raceOrType: typeof utils.raceOrType;
    typeOrRace: typeof utils.typeOrRace;
    safeGetGameSetting: typeof settings.safeGetGameSetting;
    setBonusActionUsed: typeof utils.setBonusActionUsed;
    setReactionUsed: typeof utils.setReactionUsed;
  }
  var MidiQOL: {
    actionQueue: foundry.utils.Semaphore;
    activityTypes: Record<string, { documentClass: ReturnType<typeof MidiActivityMixin> }> & {
      MidiActivityMixin: typeof MidiActivityMixin;
    };
    actorFromUuid: typeof utils.actorFromUuid;
    addConcentrationDependent: typeof utils.addConcentrationDependent;
    addDependent: typeof utils.addDependent;
    addRollTo: typeof utils.addRollTo;
    addUndoChatMessage: typeof undo.addUndoChatMessage;
    applyTokenDamage: typeof utils.applyTokenDamage;
    canSee: typeof utils.canSee;
    canSense: typeof utils.canSense;
    canSenseModes: typeof utils.canSenseModes;
    checkActivityRange: typeof utils.checkActivityRange;
    checkDistance: typeof utils.checkDistance;
    checkIncapacitated: typeof utils.checkIncapacitated;
    checkNearby: typeof utils.checkNearby;
    checkRule: typeof checkRule;
    chooseEffect: typeof utils.chooseEffect;
    collectSettingData: typeof settings.collectSettingData;
    completeActivityUse: typeof utils.completeActivityUse;
    completeItemUse: typeof utils.completeItemUse;
    computeCoverBonus: typeof utils.computeCoverBonus;
    computeDistance: typeof utils.computeDistance;
    ConfigPanel: typeof ConfigPanel;
    configSettings: () => typeof configSettings;
    contestedRoll: typeof utils.contestedRoll;
    createConditionData: typeof utils.createConditionData;
    createDamageDetailV4: typeof utils.createDamageDetailV4;
    createEffects: typeof createEffects;
    DamageOnlyWorkflow: typeof DamageOnlyWorkflow;
    debouncedUpdate: typeof utils.debouncedUpdate;
    debug: typeof debug;
    displayDSNForRoll: typeof utils.displayDSNForRoll;
    doConcentrationCheck: typeof utils.doConcentrationCheck;
    doOverTimeEffect: typeof utils.doOverTimeEffect;
    DummyWorkflow: typeof DummyWorkflow;
    enableWorkflow: boolean;
    evalAllConditions: typeof utils.evalAllConditions;
    evalCondition: typeof utils.evalCondition;
    findNearby: typeof utils.findNearby;
    findNearbyCount: typeof utils.findNearbyCount;
    fromUuidSync: typeof fromUuidSync;
    gameStats: RollStats;
    getCachedChatMessage: typeof utils.getCachedDocument;
    getChanges: typeof utils.getChanges;
    getCheckRollModeFor: typeof utils.getCheckRollModeFor;
    getConcentrationEffect: typeof utils.getConcentrationEffect;
    getSaveRollModeFor: typeof utils.getSaveRollModeFor;
    getTokenForActor: typeof utils.getOrCreateTokenForActor;
    getTokenForActorAsSet: typeof utils.getOrCreateTokenForActorAsSet;
    getTokenPlayerName: typeof utils.getTokenPlayerName;
    getTokenPlayerNameForUser: typeof utils.getTokenPlayerNameForUser;
    getTraitMult: typeof utils.getTraitMult;
    getUndoQueue: typeof undo.getUndoQueue,
    hasCondition: typeof utils.hasCondition,
    hasUsedBonusAction: typeof utils.hasUsedBonusAction,
    hasUsedReaction: typeof utils.hasUsedReaction,
    humanoid: string[];
    incapacitatedConditions: string[];
    InvisibleDisadvantageVisionModes: string[];
    isTargetable: typeof utils.isValidTarget;
    log: typeof log;
    midiBonusActionEffect: ActiveEffect.Implementation;
    midiFlags: any;
    midiFlankedEffect: ActiveEffect.Implementation;
    midiFlankingEffect: ActiveEffect.Implementation;
    midiReactionEffect: ActiveEffect.Implementation;
    midiRenderAttackRoll: typeof utils.midiRenderAttackRoll;
    midiRenderBonusDamageRoll: typeof utils.midiRenderBonusDamageRoll;
    midiRenderDamageRoll: typeof utils.midiRenderDamageRoll;
    midiRenderOtherDamageRoll: typeof utils.midiRenderOtherDamageRoll;
    midiRenderRoll: typeof utils.midiRenderRoll;
    MidiSounds: typeof MidiSounds;
    modifyDamageBy: typeof utils.modifyDamageBy;
    moveToken: typeof moveToken;
    moveTokenAwayFromPoint: typeof moveTokenAwayFromPoint;
    MQfromActorUuid: typeof utils.fromActorUuid;
    MQfromUuid: typeof fromUuidSync;
    MQOnUseOptions: Record<string, string>;
    playerFor: typeof utils.playerFor;
    playerForActor: typeof utils.playerForActor;
    raceOrType: typeof utils.raceOrType;
    reactionDialog: typeof utils.reactionDialog;
    readonly currentConfigSettings: typeof configSettings;
    readonly midiSoundSettings: Record<string, any>;
    removeActionUsed: typeof utils.removeActionUsed;
    removeBonusActionUsed: typeof utils.removeBonusActionUsed;
    removeEffects: typeof removeEffects;
    removeHiddenCondition: typeof utils.removeHiddenCondition;
    removeInvisibleCondition: typeof utils.removeInvisibleCondition;
    removeMostRecentWorkflow: typeof undo.removeMostRecentWorkflow;
    removeReactionUsed: typeof utils.removeReactionUsed;
    resolveTargetConfirmation: typeof resolveTargetConfirmation;
    safeGetGameSetting: typeof settings.safeGetGameSetting;
    selectTargetsForTemplate: typeof templateTokens;
    setBonusActionUsed: typeof utils.setBonusActionUsed;
    setReactionUsed: typeof utils.setReactionUsed;
    showItemInfo: (item: Item.Implementation) => Promise<ChatMessage.Implementation | undefined>;
    showUndoQueue: typeof undo.showUndoQueue;
    showUndoWorkflowApp: typeof showUndoWorkflowApp;
    socket: () => SaferSocket;
    TargetConfirmationDialog: typeof TargetConfirmationDialog;
    testfunc: (...args: any[]) => void;
    tokenForActor: typeof utils.tokenForActor;
    TrapWorkflow: typeof TrapWorkflow;
    TroubleShooter: typeof TroubleShooter;
    typeOrRace: typeof utils.typeOrRace;
    undoMostRecentWorkflow: typeof undo.undoMostRecentWorkflow;
    updateEffects: typeof updateEffects;
    readonly updatesCache: typeof utils.updatesCache;
    UserWorkflow: typeof UserWorkflow;
    validRollAbility: typeof utils.validRollAbility;
    WallsBlockConditions: string[];
    warn: typeof warn;
    Workflow: typeof Workflow;
    Workflows: {
      Workflow: typeof Workflow;
      DamageOnlyWorkflow: typeof DamageOnlyWorkflow;
      TrapWorkflow: typeof TrapWorkflow;
      DummyWorkflow: typeof DummyWorkflow;
      DDBGameLogWorkflow: typeof DDBGameLogWorkflow;
    };
    workflowClass: typeof Workflow,
  }
  interface CONFIG {
    // Temp, until we use dnd5e-types
    DND5E: {
      abilities: Record<string, {
        label: string;
      }>;
      abilityActivationTypes: Record<string, string>;
      activityTypes: Record<string, {
        documentClass: Function | Activity
      }>;
      actorSizes: Record<string, {
        label: string;
      }>;
      areaTargetTypes: Record<string, {
        label: string;
        counted: string;
        template: string;
        standard?: boolean;
      }>;
      armorClasses: Record<string, {
        label: string
      }>;
      consumableTypes: Record<string, {
        label: string;
        subtypes?: Record<string, string>;
      }>;
      // This one's added by midi
      customDamageResistanceTypes: Record<string, string>;
      damageTypes: Record<string, {
        label: string;
        icon: string;
        isPhysical?: boolean;
        reference?: string;
        color?: Color;
      }>;
      equipmentTypes: Record<string, string>;
      healingTypes: Record<string, {
        label: string;
        icon: string;
        color?: Color;
      }>;
      itemActionTypes: Record<string, string>;
      skills: Record<string, {
        label: string;
        ability: string;
      }>;
      sourcePacks: {
        BACKGROUNDS: string;
        CLASSES: string;
        ITEMS: string;
        RACES: string;
      };
      spellSchools: Record<string, {
        label: string;
        icon: string;
        fullKey: string;
        reference?: string;
      }>;
      tools: Record<string, {
        ability: string;
        id: string;
      }>;
      toolTypes: Record<string, string>;
      traits: Record<string, {
        labels: {
          title: string;
          localization: string;
          all?: string;
        };
        icon: string;
        actorKeyPath?: string;
        configKey?: string;
        dataType?: number | boolean;
        labelKeyPath?: string;
        subTypes?: {
          keyPath?: string;
          ids?: string[];
        };
        children?: Record<string, string>;
        sortCategories?: boolean;
        expertise?: boolean;
        mastery?: boolean;
      }>
      weaponMasteries: Record<string, {label: string, reference: string}>;
      weaponTypes: Record<string, string>;
    }
  }
}

export type TokenOrDocument = foundry.canvas.placeables.Token.Implementation | TokenDocument.Implementation;

export type DamageApplicationOptions = {
  downgrade?: true | Set<string>;
  multiplier?: number;
  ignore?: true | {
    immunity: true | Set<string>;
    resistance: true | Set<string>;
    vulnerability: true | Set<string>;
    modification: true | Set<string>;
    // midi additions:
    superSaver?: true | Set<string>;
    semiSuperSaver?: true | Set<string>;
    saved?: true | Set<string>;
    DR?: Set<string>;
  };
  invertHealing?: boolean;
  only?: "damage" | "healing";
  // midi additions:
  midi?: {
    noCalc?: boolean;
    superSaver?: boolean;
    semiSuperSaver?: boolean;
    saved?: boolean;
    saveMultiplier?: number
    sourceActorUuid?: string;
    uncannyDodge?: boolean;
  };
  midiIgnoreComputed?: boolean;
}


export type CalcDamageOptions = DamageApplicationOptions & {
  invertHealing: boolean;
  multiplier: number;
  midi: {
    applyDamage?: boolean; // is this used?
    criticalSave: boolean;
    fumbleSave: boolean;
    isCritical: boolean;
    isFumble: boolean;
    isHit: boolean;
    itemType?: string;
    save: boolean;
    saved: boolean;
    saveMultiplier: number;
    semiSuperSaver: boolean;
    sourceActorUuid?: string;
    superSaver: boolean;
    targetUuid?: string;
    uncannyDodge: boolean;
  };
  ignore?: {
    immunity?: Set<string>;
    resistance?: Set<string>;
    vulnerability?: Set<string>;
    absorption?: Set<string>;
  };
};

export type PreSetupDamageListEntry = {
  actorId: string;
  actorUuid: string;
  calcDamageOptions: CalcDamageOptions;
  challengeModeScale?: number;
  critical: boolean;
  damageDetail: DamageDescription[];
  damageDetails: {
    "calcDamageOptions.combinedDamage"?: CalcDamageOptions;
    "calcDamageOptions.defaultDamage"?: CalcDamageOptions;
    bonusDamage?: DamageDescription[];
    combinedDamage: DamageDescription[];
    defaultDamage?: DamageDescription[];
    otherDamage?: DamageDescription[];
    rawbonusDamage?: DamageDescription[];
    rawcombinedDamage: DamageDescription[];
    rawdefaultDamage?: DamageDescription[];
    rawotherDamage?: DamageDescription[];
  };
  isCharacter?: boolean;
  isHit: boolean;
  isNpc?: boolean;
  newVitality?: number;
  oldVitality?: number;
  rawDamageDetail: DamageDescription[];
  rawTotalDamage?: number;
  saved: boolean;
  sceneId: string;
  semiSuperSaver: boolean;
  superSaver: boolean;
  totalDamage: number;
  targetUuid: string;
  uncannyDodge?: boolean;
}

export type DamageListEntry = PreSetupDamageListEntry & {
  details: string[];
  healingAdjustedTotalDamage: number;
  hpDamage: number;
  newHP: number;
  newTempHP: number;
  oldHP: number;
  oldTempHP: number;
  tempDamage: number;
  useDamageDetail: boolean;
  wasHit: boolean;
}

// Temporary, so that I can at least type them to _something_
export interface Activity extends AnyMutableObject {
  actor?: Actor.Implementation;
  item: Item.Implementation;
  ammunitionItem?: Item.Implementation;
  name: string;
  uses: {
    spent: number;
    max: number;
    get value(): number;
    recovery: unknown[];
  }
  consumption: {
    scaling: {
      allowed: boolean;
      max: string;
    };
    spellSlot: boolean;
    targets: {
      type: string;
      target: string;
      value: string;
      scaling: {
        mode: string;
        formula: string;
      }
    }[];
  };
  effects: {
    _id: string;
    get effect(): ActiveEffect.Implementation | undefined;
    onSave?: boolean;
  }[];
  attack?: {
    ability: string;
    bonus: string;
    critical: {
      threshold: number;
    };
    flat: boolean;
    type: {
      value: string;
      classification: string;
    };
    damage: {};
  };
  damage?: {
    critical: {
      allow: boolean;
      bonus: string;
    };
    parts: {
      number: number;
      denomination: number;
      bonus: string;
      types: Set<string>;
      custom: {
        enabled: boolean;
        formula: string;
      };
      scaling: {
        mode: string;
        number: number;
        formula: string;
      };
    }[];
    // midi stuff
    onSave: string;
  };
  range?: {
    units?: string;
    reach?: number;
    value?: number;
    long?: number;
  }
  healing?: {
    number: number;
    denomination: number;
    bonus: string;
    types: Set<string>;
    custom: {
      enabled: boolean;
      formula: string;
    };
    scaling: {
      mode: string;
      number: number;
      formula: string;
    };
  };
  overTimeProperties?: {
    turnChoice?: string;
    saveRemoves?: boolean;
    preRemoveConditionText?: string;
    postRemoveConditionText?: string;
    removeConditionBeforeActivity?: boolean;
    removeConditionText?: string;
  }
  metadata: {
    title: string;
    img: string;
    label: string;
    name: string;
    type: string;
    usage: {
      actions: unknown;
      chatCard: string;
      dialog: unknown;
    };
  };
  refund: (consumed: unknown) => Promise<void>;
  getRollData: () => AnyMutableObject;
  rollAttack?: (config: RollProcessConfig, dialog: RollDialogConfig, message: RollMessageConfig) => Promise<Roll[] | null>;
  rollDamage: (config: RollProcessConfig, dialog: RollDialogConfig, message: RollMessageConfig) => Promise<Roll[] | void>;
  rollFormula?: (config: RollProcessConfig, dialog: RollDialogConfig, message: RollMessageConfig) => Promise<Roll[] | void>;
  roll?: {
    formula?: string;
  };
  duration: {
    concentration?: boolean;
    override?: boolean;
    scalar?: boolean;
    special: string;
    units: string;
    value: number;
  }
  target: {
    template: {
      count: string;
      contiguous: boolean;
      type: string;
      size: string;
      width: string;
      height: string;
      units: string;
    };
    affects: {
      count: string;
      type: string;
      choice: boolean;
      special: string;
    }
  };
  activation: {
    type: string;
    value: number;
    condition: string;
    cost?: number;
  };
  save?: {
    ability: Set<string>;
    dc: {
      calculation: string;
      formula: string;
      value: number
    };
  };
  check?: {
    ability: Set<string>;
    associated: Set<string>;
    dc: {
      calculation: string;
      formula: string;
      value: number
    };
  };
  getAbility?: (associated: string) => string | null;
  hasDamage: boolean;
  hasHealing: boolean;
  actionType: string;
  uuid: string;
  otherActivity?: Activity | null;
  type: string;
  useCondition: string;
  effectCondition: string;
  setupCanSeeSense: (usage: { workflow?: Workflow }) => Promise<void>;
  getTriggeredActivity: () => Promise<Activity | undefined>;
  macro: Macro.Implementation;
  midiProperties?: {
    ignoreTraits: Set<string>;
    triggeredActivityId: string;
    triggeredActivityConditionText?: string;
    triggeredActivityTargets: string;
    triggeredActivityRollAs?: string;
    forceDialog?: boolean;
    confirmTargets: string;
    autoTargetType: string;
    autoTargetAction?: string;
    automationOnly?: boolean;
    otherActivityCompatible?: boolean;
    identifier?: string;
    displayActivityName?: boolean;
    rollMode: string;
    chooseEffects?: boolean;
    toggleEffect?: boolean;
    ignoreFullCover?: boolean;
    removeChatButtons: string;
    magicEffect?: boolean;
    magicDamage?: boolean;
    noConcentrationCheck?: boolean;
    autoCEEffects: string;
  }
}

// 5e definitions, with midi special sauce(?)
export type DamageDescription = {
  value: number;
  type: string;
  properties?: Set<string>;
  active?: {
    multiplier?: number;
    modifications?: boolean;
    resistance?: boolean;
    vulnerability?: boolean;
    immunity?: boolean;
    // midi additions
    absorption?: boolean;
    DR?: boolean;
    spell?: boolean;
    magic?: boolean;
    nonmagic?: boolean;
    superSaver?: boolean;
    semiSuperSaver?: boolean;
    saved?: boolean;
    uncannyDodge?: boolean;
  };
  damage?: number;
  formula?: string;
  allActives?: string[];
};

type BasicRollConfig = {
  parts?: string[];
  data?: AnyObject;
  situational?: boolean;
  options?: {
    target?: number;
    "midi-qol"?: {
      modifiers?: string[];
    };
    properties?: string[];
    maximum?: number;
    minimum?: number;
    advantage?: boolean;
    disadvantage?: boolean;
    rollMode?: string;
  }
}

export type RollProcessConfig = {
  rolls?: BasicRollConfig[];
  evaluate?: boolean;
  event?: Event;
  hookNames?: string[];
  subject?: foundry.abstract.Document.Any;
  target?: number;
  ammunition?: {
    attackBonus?: number;
  };
  workflow?: Workflow;
  midiOptions?: MidiOptions;
  advantage?: boolean;
  disadvantage?: boolean;
  attackMode?: string;
  rollOptions?: WorkflowRollOptions
  isCritical?: boolean;
  workflowOptions?: WorkflowOptions
  skill?: string;
  rollMode?: string;
  simulate?: boolean;
  critical?: {
    allow: boolean;
  }
  flags?: unknown;
};
export type RollDialogConfig = {
  configure?: boolean;
  applicationClass?: unknown;
  options?: {
    rollType?: string;
    default?: {
      rollMode?: string;
      buildConfig?: unknown;
      rendering?: unknown;
    };
    defaultButton?: string;
    advantageMode?: number;
  };
};
export type RollMessageConfig = {
  create?: boolean;
  document?: ChatMessage.Implementation;
  rollMode?: string;
  data?: AnyMutableObject;
  hasConsumption?: boolean;
  workflow?: Workflow;
  systemCard?: boolean;
};
export type ActivityUseConfiguration = InexactPartial<{
  create: {
    measuredTemplate?: boolean;
  };
  concentration: {
    begin: boolean;
    end: string | null;
  };
  consume: {
    action: boolean;
    resources: boolean | number[];
    spellSlot: boolean;
  };
  event: Event;
  scaling: false | number;
  spell: {
    slot: number;
  };
  subsequentActions?: boolean;
  cause: {
    activity: string;
    resources: boolean | number[];
  };
  workflow: Workflow;
  midiOptions: MidiOptions;
  advantage: boolean;
  disadvantage: boolean;
  midi: {
    workflowClass: typeof Workflow;
  };
  sequenceId: string;
  activity: Activity;
}>;
export type D20RollOptions = {
  advantage?: boolean;
  disadvantage?: boolean;
  advantageMode?: number;
  criticalSuccess?: number;
  criticalFailure?: number;
  elvenAccuracy?: boolean;
  halflingLucky?: boolean;
  maximum?: number;
  minimum?: number;
};
