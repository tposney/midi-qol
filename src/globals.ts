import { AnyMutableObject, AnyObject, InexactPartial } from "fvtt-types/utils";
import { OnUseMacros } from "./module/apps/Item";
import { ActorOnUseMacrosConfig } from "./module/apps/ActorOnUseMacroConfig";
import { ItemOnUseMacrosConfig } from "./module/apps/ItemOnUseMacrosConfig";
import { DependentsExplorer } from "./module/apps/DependentsExplorer";
import { MidiActivityChoiceDialog } from "./module/apps/MidiActivityChoiceDialog";
import { MidiRollChoiceDialog } from "./module/apps/MidiRollChoiceDialog";
import { ModuleReviewDialog } from "./module/apps/ModuleReviewDialog";
import { RollStatsDisplay } from "./module/apps/RollStatsDisplay";
import { SoundConfigPanel } from "./module/apps/SoundConfigPanel";
import { TargetConfirmationConfig } from "./module/apps/TargetConfirmationConfig";
import { UndoWorkflow } from "./module/apps/UndoWorkflow";
import { OverTimeEditor } from "./module/apps/OverTimeEditor";
import { ConditionEditor } from "./module/apps/ConditionEditor";
import { AttributionMap, AugmentedEvent, DamageDescriptionObject, DamageOnlyWorkflow, DDBGameLogWorkflow, DummyWorkflow, TrapWorkflow, UndoData, UserWorkflow, Workflow, WorkflowOptions, WorkflowRollOptions } from "./module/Workflow";
import { MidiOptions } from "./module/utils";
import * as utils from "./module/utils";
import * as tokenHighlight from "./module/lib/tokenHighlight";
import * as workflowOptionsCodec from "./module/lib/workflowOptionsCodec";
import * as settings from "./module/settings";
import { RollStats, Stats } from "./module/RollStats";
import { checkRule, configSettings, targetConfirmation } from "./module/settings";
import { PersistedUndoEntry, SaferSocket, SerializedDamageListEntry } from "./module/GMAction";
import { MidiActivityMixin } from "./module/activities/MidiActivityMixin";
import * as undo from "./module/undo";
import * as patching from "./module/patching";
import { ConfigPanel } from "./module/apps/ConfigPanel";
import { createEffects, debug, log, moveToken, moveTokenAwayFromPoint, teleportToken, removeEffects, updateEffects, warn } from "./midi-qol";
import { TargetConfirmationDialog } from "./module/apps/TargetConfirmation";
import { MidiSounds } from "./module/midi-sounds";
import { computeTargetsFromTemplates, requiresTargetConfirmation, resolveTargetConfirmation, selectTargetsFromTemplates } from "./module/activities/activityHelpers";
import { showUndoWorkflowApp } from "./module/apps/UndoWorkflow";
import { TroubleShooter } from "./module/apps/TroubleShooter";
import { ChatMessageMidi } from "./module/ChatClasses/ChatMessageMidi";
import { DamageApplicationElementMidi } from "./module/ChatClasses/DamageApplicationElementMidi";
import { MidiDependentsRegistry, RegistryChangeEvent } from "./module/lib/MidiDependentsRegistry";
import { RollModifierTracker } from "./module/lib/RollModifierTracker";

declare module "fvtt-types/configuration" {
  interface AssumeHookRan {
    init: never;
  }
  namespace Hooks {
    interface HookConfig {
      "dae.addSpecialDurations": (daeSpecialDurations: Record<string, string>) => void;
      /** Custom D&D 5e, just before it replaces CONFIG.statusEffects with this list. */
      "customDnd5e.setStatusEffectsConfig": (statusEffects: typeof CONFIG.statusEffects) => void;
      "getChatMessageContextOptions": (app: unknown, options: ContextMenuEntryV14[]) => void;
      "dae.setFieldData": (fieldData: Record<string, string[]>) => void;
      "dae.addAutoFields": (addAutoFields: Function, fields: { BooleanFormulaField?: any }) => void;
      "dae.ready": (api: any) => void;
      "catReady": () => void;
      /** Condition data being built (createConditionData): add fields an item's conditions can refer to. */
      "midi-qol.conditionData": (conditionData: Record<string, unknown>, data: { workflow?: unknown, actor?: unknown, item?: unknown, target?: unknown }) => void;
      "dae.setupComplete": (api: any) => void;
      "dnd5e.preTeleport": (activity: Activity, config: { maxDistance: number, tokens: Token.Implementation[] }) => boolean | void;
      "dnd5e.teleport": (activity: Activity, plans: { token: Token.Implementation, plan: unknown }[]) => boolean | void;
      "dnd5e.postTeleport": (activity: Activity, results: { token: Token.Implementation, plan: unknown, moved: boolean }[]) => void;
      "dnd5e.activityConsumption": (activity: Activity, usageConfig: ActivityUseConfiguration, messageConfig: RollMessageConfig, updates: unknown) => boolean | void;
      "dnd5e.applyDamage": (actor: Actor.Implementation, amount: number, options: DamageApplicationOptions) => void;
      "dnd5e.calculateDamage": (actor: Actor.Implementation, damages: DamageDescription[], options: DamageApplicationOptions) => boolean | void;
      "dnd5e.postAbilityCheckRollConfiguration": (rolls: Roll[], config: RollProcessConfig, dialog: RollDialogConfig, message: RollMessageConfig) => boolean | void;
      "dnd5e.postAttackRollConfiguration": (rolls: Roll[], config: RollProcessConfig, dialog: RollDialogConfig, message: RollMessageConfig) => boolean | void;
      "dnd5e.postRollConfiguration": (rolls: Roll[], config: RollProcessConfig, dialog: RollDialogConfig, message: RollMessageConfig) => boolean | void;
      "dnd5e.postBuildSkillRollConfig": (process: RollProcessConfig, config: BasicRollConfig, index: number) => void;
      "dnd5e.postBuildAbilityCheckRollConfig": (process: RollProcessConfig, config: BasicRollConfig, index: number) => void;
      "dnd5e.postBuildSavingThrowRollConfig": (process: RollProcessConfig, config: BasicRollConfig, index: number) => void;
      "dnd5e.postBuildDeathSaveRollConfig": (process: RollProcessConfig, config: BasicRollConfig, index: number) => void;
      "dnd5e.postBuildToolRollConfig": (process: RollProcessConfig, config: BasicRollConfig, index: number) => void;
      "dnd5e.postSavingThrowRollConfiguration": (rolls: Roll[], config: RollProcessConfig, dialog: RollDialogConfig, message: RollMessageConfig) => boolean | void;
      "dnd5e.postSkillRollConfiguration": (rolls: Roll[], config: RollProcessConfig, dialog: RollDialogConfig, message: RollMessageConfig) => boolean | void;
      "dnd5e.postToolRollConfiguration": (rolls: Roll[], config: RollProcessConfig, dialog: RollDialogConfig, message: RollMessageConfig) => boolean | void;
      // According to dnd5e createdTokens is a Token[], but it is actually a TokenDocument[]
      "dnd5e.postSummon": (activity: Activity, profile: unknown, tokens: TokenDocument.Implementation[], options: unknown) => void;
      "dnd5e.postUseActivity": (activity: Activity, usageConfig: ActivityUseConfiguration, results: unknown) => boolean;
      "dnd5e.postUseLinkedSpell": (activity: Activity, usageConfig: ActivityUseConfiguration, results: unknown) => void;
      "dnd5e.preActivityConsumption": (activity: Activity, usageConfig: ActivityUseConfiguration, messageConfig: RollMessageConfig) => boolean | void;
      "dnd5e.preApplyDamage": (actor: Actor.Implementation, amount: number, updates: Actor.UpdateData, options: DamageApplicationOptions) => boolean | void;
      "dnd5e.preCalculateDamage": (actor: Actor.Implementation, damages: DamageDescription[], options: DamageApplicationOptions) => boolean | void;
      "dnd5e.preConfigureInitiative": (actor: Actor.Implementation, rollConfig: { data: AnyMutableObject, parts: string[], options: D20RollOptions }) => void;
      /**
       * dnd5e 6.0 template placement. Templates are Regions now, so the payloads are region data
       * rather than MeasuredTemplate data. `preCreateActivityTemplate` still exists upstream but
       * fires only from the deprecated `AbilityTemplate`, which midi no longer uses.
       */
      "dnd5e.preCreateMeasuredTemplate": (activity: Activity, placementConfig: Record<string, unknown>) => boolean | void;
      "dnd5e.createMeasuredTemplate": (activity: Activity, regionData: Record<string, any>[]) => boolean | void;
      "dnd5e.postCreateMeasuredTemplate": (activity: Activity, templates: RegionDocument.Implementation[]) => void;
      "dnd5e.preRollAbilityCheck": (config: RollProcessConfig, dialog: RollDialogConfig, message: RollMessageConfig) => boolean | void;
      "dnd5e.preRollAttack": (rollConfig: RollProcessConfig & { attackMode: string }, dialogConfig: RollDialogConfig, messageConfig: RollMessageConfig) => boolean | void;
      "dnd5e.preRollAttackV2": (rollConfig: RollProcessConfig & { attackMode: string }, dialogConfig: RollDialogConfig, messageConfig: RollMessageConfig) => boolean | void;
      "dnd5e.preRollConcentration": (config: RollProcessConfig, dialog: RollDialogConfig, message: RollMessageConfig) => boolean | void;
      "dnd5e.preRollDamage": (config: RollProcessConfig, dialog: RollDialogConfig, message: RollMessageConfig) => boolean | void;
      "dnd5e.preRollDeathSave": (config: RollProcessConfig, dialog: RollDialogConfig, message: RollMessageConfig) => boolean | void;
      "dnd5e.preRollDeathSaveV2": (config: RollProcessConfig, dialog: RollDialogConfig, message: RollMessageConfig) => boolean | void;
      "dnd5e.preRollD20TestV2": (config: RollProcessConfig, dialog: RollDialogConfig, message: RollMessageConfig) => boolean | void;
      "dnd5e.preRollSavingThrow": (config: RollProcessConfig, dialog: RollDialogConfig, message: RollMessageConfig) => boolean | void;
      "dnd5e.preRollSkill": (config: RollProcessConfig, dialog: RollDialogConfig, message: RollMessageConfig) => boolean | void;
      "dnd5e.preRollTool": (config: RollProcessConfig, dialog: RollDialogConfig, message: RollMessageConfig) => boolean | void;
      "dnd5e.preUseActivity": (activity: Activity, usageConfig: AnyMutableObject, dialogConfig: AnyMutableObject, messageConfig: AnyMutableObject) => boolean | void;
      "dnd5e.restCompleted": (actor: Actor.Implementation, result: { longRest: boolean; newDay: boolean }, config: unknown) => void;
      "dnd5e.rollAttack": (rolls: Roll[], data: { subject: Activity | null, ammoUpdate: { id: string, destroy: boolean; quantity: number } | null }) => void;
      "dnd5e.rollConcentration": (rolls: Roll[], data: { subject?: Actor.Implementation }) => void;
      "dnd5e.rollDamage": (rolls: Roll[], data?: { subject?: Activity }) => void;
      "dnd5e.rollDeathSave": (rolls: Roll[], data: { chatString: string; updates: Actor.UpdateData; subject: Actor.Implementation }) => boolean | void;
      "midi-qol.ConfigSettingsChanged": () => void;
      "midi-qol.RollComplete": (workflow: Workflow) => Promise<void>;
      "midi-qol.postCleanup": (workflow: Workflow) => Promise<void | boolean>;
      "midi-qol.preAbort": (workflow: Workflow) => Promise<void | boolean>;
      "midi-qol.dnd5ePreCalculateDamage": (actor: Actor.Implementation, damages: DamageDescription[], options: DamageApplicationOptions) => boolean | void;
      "midi-qol.dnd5eCalculateDamage": (actor: Actor.Implementation, damages: DamageDescription[], options: DamageApplicationOptions) => void;
      "midi-qol.preItemRoll": (workflow: Workflow) => Promise<void | boolean>;
      "midi-qol.preAttackRoll": (workflow: Workflow) => Promise<void | boolean>;
      "midi-qol.preAttackRollConfig": (workflow: Workflow) => Promise<void | boolean>;
      "midi-qol.AttackRollComplete": (workflow: Workflow) => Promise<void | boolean>;
      "midi-qol.DamageRollComplete": (workflow: Workflow) => Promise<void | boolean>;
      "midi-qol.preSetReactionUsed": (actor: Actor.Implementation, effect: ActiveEffect.Implementation) => boolean | void;
      "midi-qol.setReactionUsed": (actor: Actor.Implementation, effect: ActiveEffect.Implementation) => void;
      "midi-qol.preSetBonusActionUsed": (actor: Actor.Implementation, effect: ActiveEffect.Implementation) => boolean | void;
      "midi-qol.setBonusActionUsed": (actor: Actor.Implementation, effect: ActiveEffect.Implementation) => void;
      "midi-qol.StatsUpdated": () => void;
      "midi-qol.addUndoEntry": (data: UndoData) => void;
      "midi-qol.midiReady": () => void;
      "midi-qol.ready": () => void;
      "midi-qol.removeUndoEntry": (data?: UndoData) => void;
      "midi-qol.setup": (data: typeof globalThis.MidiQOL) => void;
      "midi-qol.targeted": (targets: Set<Token.Implementation> | undefined) => void;
      "midi-qol.dependentsRegistryChanged": (event: RegistryChangeEvent) => void;
      "midi-qol-setup-wizard.launch": () => void;
      "getHeaderControlsActivitySheet": (app: foundry.applications.api.Application /*dnd5e.applications.activity.activitySheet*/ , buttons: any[]) => void;
      "tidy5e-sheet.ready": (api: any) => void;
      "simplecover5eReady": () => void;
    }
  }
  interface SettingConfig {
    "dnd5e.disableConcentration": boolean;
    "dnd5e.metricLengthUnits": boolean;
    "dnd5e.attackRollVisibility": string;
    "dnd5e.challengeVisibility": string;
    "midi-qol.MidiSoundSettings": Record<string, any>;
    "midi-qol.playerControlsInvisibleTokens": boolean;
    "midi-qol.RollStats": Record<string, Stats>;
    "midi-qol.acknowledgedOverlaps": string[];
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
        dependentOn?: string;
        dependents?: {
          uuid: string;
        }[];
        itemUuid?: string;
        activity?: {
          type: string;
          id: string;
          uuid: string;
        }
        item?: {
          type: string;
          id: string;
          uuid: string;
        }
        riders?: {
          effect?: string[];
          activity?: string[];
          statuses?: string[];
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
        expiryMode?: "default" | "delete" | "suppress";
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
        dependentOn?: string; // UUID of parent document (Actor/Item) for midi-qol dependent tracking
        overtime?: {
          permanent?: boolean;      // Effect marked permanent by saveCount/failCount
          savesRemaining?: number;  // Remaining saves needed for saveCount
          failsRemaining?: number;  // Remaining fails needed for failCount
        };
        overtimeChatCardUuids?: string[];
        transformedActorUuids?: string[];
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
        // dnd5e transformation flags
        isPolymorphed?: boolean;
        originalActor?: string; // actor ID of the pre-transform form
        previousActorIds?: string[];
      };
      "midi-qol"?: {
        dependentOn?: string; // UUID of parent document for midi-qol dependent tracking
        actions?: {
          // This really should be structured but actions.reaction is used in other modules and macros
          reaction?: boolean,
          reactionsUsed?: number, 
          reactionsMax?: number;
          reactionsReset?: "eachTurn"| "onTurnStart" | "rest" | "never"; // When reactions reset default: onTurnStart
          action?: boolean;
          bonus?: boolean;
          bonusActionsUsed?: number;
          bonusActionsMax?: number;
          bonusActionsReset?: "eachTurn" | "onTurnStart" | "rest" | "never"; // When bonus actions reset default: onTurnStart
          reactionCombatRound?: number;
          bonusActionCombatRound?: number;
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
        canFlank: string;
        carefulSpells?: boolean;
        concentrationSaveBonus?: number;
        critical?: Record<string, string>;
        damage?: {
          advantage?: boolean;
          "reroll-kh"?: boolean;
          "reroll-kl"?: boolean;
        };
        deathSaveBonus?: number;
        noDeathSaveFailureFromDamage?: boolean;
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
          deathSave?: string;
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
          tool?: Record<string, string>;
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
          fumble?: Record<string, string>;
          noFumble?: Record<string, string>;
          noDisadvantage?: {
            attack?: Record<string, string>;
          };
        };
        ignoreCover?: boolean;
        ignoreNearbyFoes?: boolean;
        ignoreWalls?: boolean;
        initiativeAdv?: string;
        initiativeDisadv?: string;
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
          deathSave?: string;
          skill?: {
            all?: string;
          };
          tool?: Record<string, string>;
        };
        min?: {
          ability?: {
            all?: string;
            check?: Record<string, string>;
            save?: Record<string, string>;
          }
          damage?: Record<string, string>;
          deathSave?: string;
          skill?: {
            all?: string;
          };
          tool?: Record<string, string>;
        };
        neverTarget?: boolean;
        noAdvantage?: {
          ability?: {
            all?: string;
            check?: Record<string, string>;
            save?: Record<string, string>;
          };
          all?: string;
          attack?: Record<string, string>;
          concentration?: string;
          deathSave?: string;
          initiative?: string;
          skill?: Record<string, string>;
          tool?: Record<string, string>;
        };
        noDisadvantage?: {
          ability?: {
            all?: string;
            check?: Record<string, string>;
            save?: Record<string, string>;
          };
          all?: string;
          attack?: Record<string, string>;
          concentration?: string;
          deathSave?: string;
          initiative?: string;
          skill?: Record<string, string>;
          tool?: Record<string, string>;
        };
        noCritical?: Record<string, string>;
        noFumble?: Record<string, string>;
        fumble?: Record<string, string>;
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
        save?: {
          fail?: Record<string, string>;
        };
        sculptSpells?: boolean;
        semiSuperSaver?: Record<string, string>;
        sharpShooter?: string;
        success?: {
          ability?: {
            all?: string;
            check?: Record<string, string>;
            save?: Record<string, string>;
          };
          all?: boolean;
          attack?: Record<string, string>;
          deathSave?: string;
          skill?: Record<string, string>;
          tool?: Record<string, string>;
        };
        superSaver?: Record<string, string>;
        uncannyDodge?: boolean;
      };
    };
    ChatMessage: {
      // dnd5e 6 keeps a message's data in `system`; transform is the one flag it still uses.
      dnd5e?: {
        "transform.uuid"?: string;
        "transform.profile"?: string;
      };
      "midi-qol"?: {
        activityUuid?: string;
        itemData?: Item.CreateData;
        actorUuid?: string;
        sourceActorUuid?: string;
        advantageSaveUuids?: string[];
        ammunitionOnUseMacros?: OnUseMacros;
        AoO?: boolean;
        attackTotal?: number;
        attackRoll?: Roll.Data | Roll;
        attackRollCount?: number;
        bonusDamageDetail?: DamageDescriptionObject[];
        bonusDamageRolls?: Roll.Data[] | Roll[];
        bonusDamageTotal?: number;
        concentrationRolled?: boolean;
        criticalSaveUuids?: string[];
        currentAction?: [string, string];
        d20AttackRoll?: number;
        damageDetail?: DamageDescriptionObject[];
        damageList?: DamageListEntry[];
        damageRollCount?: number;
        damageRolls?: Roll.Data[] | Roll[];
        damageTotal?: number;
        defaultDamageType?: string;
        diceRoll?: number;
        effectsAlreadyExpired?: string[];
        failedSaveUuids?: string[];
        fumbleSaveUuids?: string[];
        hitTargetUuids?: string[];
        hitECTargetUuids?: string[];
        inCombat?: boolean;
        isCritical?: boolean;
        isFumble?: boolean;
        itemUseComplete?: boolean;
        expectedTemplateCount?: number;
        noOptionalRules?: boolean;
        OnUseMacros?: OnUseMacros;
        otherDamageDetail: DamageDescriptionObject[];
        otherDamageRolls?: Roll.Data[] | Roll[];
        otherDamageTotal?: number;
        rawBonusDamageDetail?: DamageDescriptionObject[];
        rawDamageDetail?: DamageDescriptionObject[];
        rawOtherDamageDetail?: DamageDescriptionObject[];
        saveDisplayData?: unknown;
        saveUuids?: string[];
        /** Structured save attribution map: targetUuid -> type -> source -> displayName */
        saveAttribution?: Record<string, AttributionMap>;
        semiSuperSaverUuids?: string[];
        superSaverUuids?: string[];
        suspended?: boolean;
        targets?: { uuid: string; name: string }[];
        targetsCanSeeUuids?: string[];
        targetsCanSenseUuids?: string[];
        transformedActors: string[];
        tokenCanSeeUuids?: string[];
        tokenCanSenseUuids?: string[];
        attackingTokenUuid?: string;
        templateUuid?: string;
        templateUuids?: string[];
        workflowOptions?: WorkflowOptions;
        // written as PersistedUndoEntry; messages predating the prune carry the full socket shape
        undoDamage?: (PersistedUndoEntry | SerializedDamageListEntry)[];
        utilityRolls?: Roll.Data[] | Roll[];
        "use.consumed"?: any;
        "use.otherScaling"?: number | false;
        aborted?: boolean;
        type?: number;
        overtimeActorUuid?: string;
        /** The roll mode an over-time roll request asks for */
        overtimeRollMode?: string;
        messageType?: string;
        roll?: unknown[];
        syntheticItem?: boolean;
        isHit?: boolean;
        otherActivityConsumed?: object;
        /** The card this message goes with: deleting that card deletes this message (e.g. a sample action's result) */
        origin?: string;
      };
    };
    Item: {
      dnd5e?: {
        scaling?: number;
        spellLevel?: {
          base?: number;
          value?: number;
        };
        cachedFor?: Item;
        dependentOn?: string;
        riders?: {
          activity?: string[];
        }
      };
      "midi-qol"?: {
        dependentOn?: string; // UUID of parent document for midi-qol dependent tracking
        onUseMacroParts?: OnUseMacros;
        onUseMacroName?: string;
        noProvokeReaction?: boolean;
        isConcentrationCheck?: boolean;
        // Optional bonus flags applied to the item (e.g. via enchantment effects), checked
        // alongside the actor's optional flags when the item is used.
        optional?: Record<string, any>;
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
        dependentOn?: string;
      };
      "midi-qol"?: {
        itemUuid?: string;
        actorUuid?: string;
        activityUuid?: string;
        workflowId?: string;
        itemCardUuid?: string;
        dependentOn?: string; // UUID of parent document (Actor/Item) for midi-qol dependent tracking
        anchorToToken?: boolean; // Whether cone/ray template origin is anchored to caster's token border
      };
    };
    MeasuredTemplateDocument: {
      dnd5e?: {
        origin?: string;
        dependentOn?: ActiveEffect.Implementation | null;
      };
      "midi-qol"?: {
        dependentOn?: string; // UUID of parent document (Actor/Item) for midi-qol dependent tracking
        anchorToToken?: boolean; // Whether cone/ray template origin is anchored to caster's token border
      };
    }
    TokenDocument: {
      dnd5e?: {
        dependentOn?: string;
      };
      "midi-qol"?: {
        dependentOn?: string; // UUID of parent document (Actor/Item) for midi-qol dependent tracking
        // Per-token override (0-100) for vision source elevation as a fraction of token height.
        visionSourceHeight?: number;
        // Per-token override (0-100) for vision target elevation as a fraction of token height.
        visionTargetHeight?: number;
      };
    }
    AmbientLightDocument: {
      "midi-qol"?: {
        dependentOn?: string; // UUID of parent document (Actor/Item) for midi-qol dependent tracking
      };
    }
  }
};

declare global {
  namespace ChatMessage.Database {
    interface Create<Temporary extends boolean | undefined = boolean | undefined> {
      /** Foundry 14: a CONFIG.ChatMessage.modes key; replaces the deprecated rollMode option. */
      messageMode?: string;
    }
  }
  // v14 data field operators, not yet in fvtt-types. `{ key: new ForcedDeletion() }` replaces the
  // `{ "-=key": null }` deletion syntax that v14 deprecates.
  namespace foundry.data.operators {
    class ForcedDeletion {
      constructor(value?: unknown);
    }
  }

  /** fvtt-types brands module sub-types, so "midi-qol.damage" needs declaring to be assignable. */
  interface DataModelConfig {
    ChatMessage: {
      "midi-qol.damage": typeof import("./module/ChatClasses/DamageCardMessage.js").MidiDamageMessageData;
    };
  }

  /** fvtt-types' v14 ChatLog is a stub; merged into `ui.chat`'s type. */
  interface UI {
    chat?: {
      /** Re-render a message in the log, or insert it if it has become visible to this user. */
      updateMessage(message: ChatMessage.Implementation, options?: { notify?: boolean }): Promise<void>;
    };
  }

  namespace Roll {
    interface _Options {
      /** dnd5e D20Roll advantage mode: -1 (disadvantage), 0 (normal), 1 (advantage) */
      advantageMode?: number;
      /** dnd5e DamageRoll damage type. */
      type?: string;
      /** dnd5e DamageRoll properties (e.g. "mgc"). */
      properties?: string[];
    }
  }

  // Foundry v14 TokenDocument additions not yet in fvtt-types.
  interface TokenDocument {
    /** Token vertical depth in grid units; affects collision and elevation math. */
    depth: number;
    /** Movement-origin computation point (token center adjusted by half its depth). */
    getMovementOrigin(data?: { x?: number; y?: number; elevation?: number; width?: number; height?: number; depth?: number }): { x: number; y: number; elevation: number };
  }

  // Foundry v14 movement planning and token placement, not yet in fvtt-types (used by the teleport activity).
  interface TokenDocument {
    /** Start a movement planned with Token#planMovement. */
    startMovement(id: string): Promise<boolean>;
  }
  interface Token {
    planMovement(options?: { allowedActions?: string[]; direct?: boolean; maxDistance?: number; preventDrop?: boolean }): Promise<{
      id: string; origin: { x: number; y: number; elevation?: number }; destination: { x: number; y: number; elevation?: number }; waypoints: unknown[];
    } | null>;
  }
  interface TokenLayer {
    placeTokens(data: object[], options?: {
      create?: boolean; allowRotation?: boolean;
      preConfirm?: (args: { document: TokenDocument.Implementation }) => boolean | void;
      preSkip?: (args: { document: TokenDocument.Implementation }) => boolean | void;
    }): Promise<TokenDocument.Implementation[]>;
  }

  // Note: Intentional `var` use here to add to the `globalThis`
  var DAE: {
    actionQueue: foundry.utils.Semaphore;
    createSyntheticMacro: (command: string, name?: string) => Macro.Implementation;
    createFunctionMacro: (functionPath: string) => Macro.Implementation;
    resolveWorldMacro: (nameOrUuid: string) => Promise<Macro.Implementation | undefined>;
    getItemMacroCommand: (source: unknown) => string | undefined;
    /** DAE 14.6.2+ (dnd5e 6): where an effect came from */
    getEffectSource: (effect: unknown) => { actorUuid?: string; itemUuid?: string; activityUuid?: string; controllingEffectUuid?: string; sourceEffectUuid?: string; messageUuid?: string };
    /** DAE 14.6.2+ (dnd5e 6): an effect's item as data (live, else its card's snapshot) */
    getEffectItemData: (effect: unknown) => Item.Source | undefined;
    getActorItemData: (actor: Actor.Implementation, uuid: string) => Item.Source | undefined;
    /** Ends an effect as its expiry settings say: delete, or suppress (disable) and keep */
    expireEffect: (effect: ActiveEffect.Implementation, options?: object) => Promise<void>;
    doEffects: (...args: any[]) => Promise<any>;
    doActivityEffects: (...args: any[]) => Promise<any>;
    DIMEditor: any;
    localizationMap: Record<string, { name?: string; description?: string }>;
    [key: string]: any;
  };
  /** Coven's Automation Toolkit, when active: the parts midi uses. */
  var cat: {
    api: {
      registerAutomationModule: (id: string, options?: {
        ignoredPackIds?: string[];
        infoFetcherCallback?: (entry: { flags?: { cat?: { automation?: { version?: string } } } }) => object;
      }) => Promise<unknown>;
    };
    utils: {
      automationUtils: { updateItem: (item: Item.Implementation, options?: object) => Promise<unknown> };
    };
  } | undefined;
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
    getCoverBonus: typeof utils.getCoverBonus;
    highlightTokens: typeof tokenHighlight.highlightTokens;
    tokenAtPosition: typeof utils.tokenAtPosition;
    computeDistance: typeof utils.computeDistance;
    getDistance: typeof utils.getDistance;
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
    activityHasEmanationNoTemplate: typeof utils.activityHasEmanationNoTemplate;
    actorFromUuid: typeof utils.actorFromUuid;
    addConcentrationDependent: typeof utils.addConcentrationDependent;
    addDependent: typeof utils.addDependent;
    addRollTo: typeof utils.addRollTo;
    addRollToAsync: typeof utils.addRollToAsync;
    addUndoChatMessage: typeof undo.addUndoChatMessage;
    RollModifierTracker: typeof RollModifierTracker;
    applyTokenDamage: typeof utils.applyTokenDamage;
    canSee: typeof utils.canSee;
    canSense: typeof utils.canSense;
    canSenseModes: typeof utils.canSenseModes;
    checkActivityRange: typeof utils.checkActivityRange;
    isRangeCheckable: typeof utils.isRangeCheckable;
    activityRanges: typeof utils.activityRanges;
    checkDistance: typeof utils.checkDistance;
    checkIncapacitated: typeof utils.checkIncapacitated;
    checkNearby: typeof utils.checkNearby;
    checkRule: typeof checkRule;
    chooseEffect: typeof utils.chooseEffect;
    collectSettingData: typeof settings.collectSettingData;
    exportSettingsToJSON: typeof settings.exportSettingsToJSON;
    importSettingsFromJSON: typeof settings.importSettingsFromJSON;
    resetConfigSettingsToDefaults: typeof settings.resetConfigSettingsToDefaults;
    registerWorkflowOptionsSchema: typeof workflowOptionsCodec.registerWorkflowOptionsSchema;
    restoreWorkflowTokenSets: typeof utils.restoreWorkflowTokenSets;
    completeActivityUse: typeof utils.completeActivityUse;
    completeItemUse: typeof utils.completeItemUse;
    computeAbilityAdvantage: typeof patching.computeAbilityAdvantage;
    computeCoverBonus: typeof utils.computeCoverBonus;
    getCoverBonus: typeof utils.getCoverBonus;
    highlightTokens: typeof tokenHighlight.highlightTokens;
    tokenAtPosition: typeof utils.tokenAtPosition;
    computeDistance: typeof utils.computeDistance;
    convertDuration: typeof utils.convertDuration;
    getDistance: typeof utils.getDistance;
    computeSkillAdvantage: typeof patching.computeSkillAdvantage;
    computeTargetsFromTemplates: typeof computeTargetsFromTemplates;
    computeToolAdvantage: typeof patching.computeToolAdvantage;
    ConfigPanel: typeof ConfigPanel;
    configSettings: () => typeof configSettings;
    contestedRoll: typeof utils.contestedRoll;
    createConditionData: typeof utils.createConditionData;
    createDamageDetail: typeof utils.createDamageDetail;
    decodeWorkflowOptions: typeof workflowOptionsCodec.decodeWorkflowOptions;
    encodeWorkflowOptions: typeof workflowOptionsCodec.encodeWorkflowOptions;
    createEffects: typeof createEffects;
    DamageOnlyWorkflow: typeof DamageOnlyWorkflow;
    debouncedUpdate: typeof utils.throttledUpdate;
    debug: typeof debug;
    displayDSNForRoll: typeof utils.displayDSNForRoll;
    doConcentrationCheck: typeof utils.doConcentrationCheck;
    doOverTimeEffect: typeof utils.doOverTimeEffect;
    DummyWorkflow: typeof DummyWorkflow;
    enableWorkflow: boolean;
    evalAllConditions: typeof utils.evalAllConditions;
    evalCondition: typeof utils.evalCondition;
    fetchParams: typeof settings.fetchParams;
    findNearby: typeof utils.findNearby;
    findNearbyCount: typeof utils.findNearbyCount;
    fromUuidSync: typeof fromUuidSync;
    gameStats: RollStats;
    getCachedChatMessage: typeof utils.getCachedDocument;
    getChanges: typeof utils.getChanges;
    getCheckRollModeFor: typeof utils.getCheckRollModeFor;
    getConcentrationEffect: typeof utils.getConcentrationEffect;
    getSaveRollModeFor: typeof utils.getSaveRollModeFor;
    getItemFromEffectOrigin: typeof utils.getItemFromEffectOrigin;
    getTokenForActor: typeof utils.getOrCreateTokenForActor;
    getTokenForActorAsSet: typeof utils.getOrCreateTokenForActorAsSet;
    getTokenPlayerName: typeof utils.getTokenPlayerName;
    getTokenPlayerNameForUser: typeof utils.getTokenPlayerNameForUser;
    getTraitMult: typeof utils.getTraitMult;
    getUndoQueue: typeof undo.getUndoQueue,
    getActorWoundedSemaphore: (actorUuid: string) => foundry.utils.Semaphore,
    getVitalityItem: typeof utils.getVitalityItem,
    getVitalityMax: typeof utils.getVitalityMax,
    getVitalityValue: typeof utils.getVitalityValue,
    hasCondition: typeof utils.hasCondition,
    hasUsedBonusAction: typeof utils.hasUsedBonusAction,
    hasUsedReaction: typeof utils.hasUsedReaction,
    hasVitalitySystem: typeof utils.hasVitalitySystem,
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
    MidiDependentsRegistry: typeof MidiDependentsRegistry;
    MidiSounds: typeof MidiSounds;
    modifyDamageBy: typeof utils.modifyDamageBy;
    moveToken: typeof moveToken;
    moveTokenAwayFromPoint: typeof moveTokenAwayFromPoint;
    teleportToken: typeof teleportToken;
    MQdefaultDamageType: string;
    MQfromActorUuid: typeof utils.fromActorUuid;
    MQfromUuid: typeof fromUuidSync;
    MQOnUseOptions: Record<string, string>;
    playerFor: typeof utils.playerFor;
    playerForActor: typeof utils.playerForActor;
    processWoundedStatus: (actor: Actor.Implementation) => Promise<void>;
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
    requiresTargetConfirmation: typeof requiresTargetConfirmation;
    resolveTargetConfirmation: typeof resolveTargetConfirmation;
    safeGetGameSetting: typeof settings.safeGetGameSetting;
    shouldDisplaySaveDC: typeof settings.shouldDisplaySaveDC;
    selectTargetsFromTemplates: typeof selectTargetsFromTemplates;
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
    midiPropertiesOptions: {
      triggeredActivityTargetOptions: any;
      triggeredActivityRollAsOptions: any;
    }
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
    ChatClasses: {
      ChatMessageMidi: typeof ChatMessageMidi,
      DamageApplicationElementMidi: typeof DamageApplicationElementMidi
    }
    apps: {
      ActorOnUseMacrosConfig: typeof ActorOnUseMacrosConfig,
      ConditionEditor: typeof ConditionEditor,
      ConfigPanel: typeof ConfigPanel,
      DependentsExplorer: typeof DependentsExplorer,
      ItemOnUseMacrosConfig: typeof ItemOnUseMacrosConfig,
      MidiActivityChoiceDialog: typeof MidiActivityChoiceDialog,
      MidiRollChoiceDialog: typeof MidiRollChoiceDialog,
      ModuleReviewDialog: typeof ModuleReviewDialog,
      OverTimeEditor: typeof OverTimeEditor,
      RollStatsDisplay: typeof RollStatsDisplay,
      SoundConfigPanel: typeof SoundConfigPanel,
      TargetConfirmationConfig: typeof TargetConfirmationConfig,
      TargetConfirmationDialog: typeof TargetConfirmationDialog,
      TroubleShooter: typeof TroubleShooter,
      UndoWorkflow: typeof UndoWorkflow,
    }
    workflowClass: typeof Workflow,
    logEvaluationData: boolean,
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
        token?: number;
        numerical: number;
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
      // Whether the damage card merges its rolls by damage type for display.
      aggregateDamageDisplay: boolean;
      // This one's added by midi
      customDamageResistanceTypes: Record<string, string>;
      damageTypes: Record<string, {
        label: string;
        // Only healingTypes are localized with a short label today, but dnd5e reads
        // `config?.labelShort ?? config?.label` off either config, so both carry it.
        labelShort?: string;
        icon: string;
        isPhysical?: boolean;
        reference?: string;
        color?: Color;
      }>;
      equipmentTypes: Record<string, string>;
      healingTypes: Record<string, {
        label: string;
        labelShort?: string;
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
      weaponMasteries: Record<string, { label: string, reference?: string }>;
      weaponTypes: Record<string, string>;
    }
  }
}

export type SelectOptionValue = string | { label: string; hint: string };
export type SelectOptions = Record<string, SelectOptionValue>;

/** A Foundry v14 context-menu entry; fvtt-types still describes the v13 shape (name/callback/condition). */
export interface ContextMenuEntryV14 {
  label: string;
  icon?: string;
  visible?: (li: HTMLElement) => boolean;
  onClick: (event: Event, li: HTMLElement) => unknown;
}

export type TokenOrDocument = foundry.canvas.placeables.Token.Implementation | TokenDocument.Implementation;

/** v14 change values are an AnyField; fvtt-types declares `string`. Forces narrowing before string ops. */
export type MidiChangeData = Omit<ActiveEffect.ChangeData, "value"> & { value: unknown };

export interface MoveTokenOptions {
  /** Animate the movement (default: true). When false, movement is instant but still respects wall/token constraints. */
  animate?: boolean;
  /** Instant movement, ignores walls and tokens (default: false). Implies animate: false. */
  teleport?: boolean;
  /** Ignore wall collisions during movement (default: false) */
  ignoreWalls?: boolean;
  /** Ignore token-token blocking during movement (default: false). Passed to dnd5e's constrainMovementPath. */
  ignoreTokens?: boolean;
  /** Rotate token to face movement direction (default: false) */
  autoRotate?: boolean;
}

export interface TeleportTokenDestination {
  /** Center x in canvas pixels */
  x: number;
  /** Center y in canvas pixels */
  y: number;
  /** Elevation in grid units */
  elevation?: number;
  /** Destination scene UUID (omit for same scene) */
  sceneUuid?: string;
}

/**
 * Generic constructor type for mixin patterns.
 * Used to type functions that accept a class constructor and return a new class.
 */
export type Constructor<T = {}> = abstract new (...args: any[]) => T;

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
    /** From midi's tray, which lists other damage for every target: whether each source's damage applies to this one. */
    otherApplies?: boolean;
    ammunitionApplies?: boolean;
    ammunitionSaveMultiplier?: number;
    sourceActorUuid?: string;
    /** The card the damage came from, for dnd5e's damage hooks (origin / originatingMessage) */
    itemCardUuid?: string;
    uncannyDodge?: boolean;
    /** Image of whatever granted uncanny dodge; resolved while the reaction's effect still exists. */
    uncannyDodgeIcon?: string;
  };
  midiIgnoreComputed?: boolean;
  midiVitalityHandled?: boolean;
  midiVitalityUpdatePending?: boolean;
}


export type CalcDamageOptions = DamageApplicationOptions & {
  invertHealing: boolean;
  multiplier: number;
  midi: {
    challengeModeAR?: number;
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
    /** The card the damage came from, for dnd5e's damage hooks (origin / originatingMessage) */
    itemCardUuid?: string;
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
  // calcDamageOptions: CalcDamageOptions;
  challengeModeScale?: number;
  challengeModeAR?: number;
  critical: boolean;
  damageDetail: DamageDescription[];
  damageDetails: {
    calcDamageOptions: {
      combinedDamage?: CalcDamageOptions,
      defaultDamage?: CalcDamageOptions,
      otherDamage?: CalcDamageOptions,
      bonusDamage?: CalcDamageOptions,
    },
    bonusDamage?: DamageDescription[];
    combinedDamage: DamageDescription[];
    // Entries midi injects during calculation (the aggregate DR entry) - cross-category.
    injectedDamage?: DamageDescription[];
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
  // vitalityItem fields (for items with uses as vitality pool)
  oldVitalitySpent?: number;
  oldDeathFailures?: number;
  newDeathFailures?: number;
  newVitalitySpent?: number;
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

/** Per-entry display data for the damage card tooltip, kept because the stored damageDetail is the
 *  raw (pre-calculation) list and so carries no `active` markers to derive modifications from. */
export type DamageModDisplay = { type: string; value: number; mods: string[] };

export type DamageListEntry = PreSetupDamageListEntry & {
  damageMods?: DamageModDisplay[];
  damageSelector: string;
  calcDamageOptions: CalcDamageOptions;
  updateOptions: any;
  details: string[];
  healingAdjustedTotalDamage: number;
  hpDamage: number;
  newHP: number;
  newTempHP: number;
  newTempMax?: number;
  oldHP: number;
  oldTempHP: number;
  oldTempMax?: number;
  tempDamage: number;
  useDamageDetail: boolean;
  wasHit: boolean;
}

// Temporary, so that I can at least type them to _something_
export type ActivitySave = {
  ability: Set<string>;
  dc: {
    calculation: string;
    formula: string;
    value: number
  };
}

export type ActivityCheck = {
  ability: string;
  associated: Set<string>;
  dc: {
    calculation: string;
    formula: string;
    value: number
  };
}

/**
 * A dnd5e 6 activity effect profile: a local effect on the item by `_id`, or a standalone one (such as
 * a compendium effect) by `uuid`. `getEffect()` is synchronous for a local effect, async for a uuid.
 */
export interface ActivityEffectData {
    _id: string | null;
    uuid?: string | null;
    level?: { min?: number | null, max?: number | null };
    onSave?: boolean;
    /** `.ActiveEffect.<id>` for a local effect, otherwise its uuid. */
    readonly relativeUUID: string;
    getEffect(): ActiveEffect.Implementation | undefined | Promise<ActiveEffect.Implementation | null>;
}

export interface Activity extends AnyMutableObject {
  get applicableEffects(): ActivityEffectData[] | null;
  /** The level effect profiles are filtered against. */
  relevantLevel: number;
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
  effects: ActivityEffectData[];
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
    rollAs?: string;
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
  rollAttack?(config: RollProcessConfig, dialog: RollDialogConfig, message: RollMessageConfig): Promise<Roll[] | null>;
  rollDamage(config: RollProcessConfig, dialog: RollDialogConfig, message: RollMessageConfig): Promise<Roll[] | void>;
  rollFormula?(config: RollProcessConfig, dialog: RollDialogConfig, message: RollMessageConfig): Promise<Roll[] | void>;
  // Consumption and scaling methods/properties
  canScale?: boolean;
  _prepareUsageConfig: (config: object) => object;
  _prepareUsageUpdates: (config: object, options?: { returnErrors?: boolean }) => Promise<any>;
  // consume() method for consuming activity resources - returns consumed delta data or false if cancelled
  consume: (usageConfig: object, messageConfig: object) => Promise<object | false>;
  roll?: {
    formula?: string;
    name: string;
    prompt: boolean;
    visible: boolean;
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
      stationary?: boolean;
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
  save?: ActivitySave;
  check?: ActivityCheck;
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
    followUp?: boolean;
    followUpCondition?: string;
    triggeredActivityTargets: string;
    triggeredActivityRollAs?: string;
    triggeredActivityConsume?: boolean;
    triggeredActivityConfigure?: boolean;
    autoConsume: boolean;
    forceConsumeDialog?: string;
    forceRollDialog?: string;
    forceDamageDialog?: string;
    confirmTargets: string;
    autoTargetType: string;
    autoTargetAction?: string;
    automationOnly?: boolean;
    otherActivityCompatible?: boolean;
    identifier?: string;
    displayActivityName?: boolean;
    rollMode: keyof CONFIG.Dice.RollModes;
    chooseEffects?: boolean;
    toggleEffect?: boolean;
    ignoreFullCover?: boolean;
    targetMustBeSeen?: boolean;
    removeChatButtons: string;
    magicEffect?: boolean;
    magicDamage?: boolean;
    noConcentrationCheck?: boolean;
    skipConcentrationCheck?: boolean;
    autoCEEffects: string;
  }
  // Midi mixin methods
  hasConsumption: () => boolean;
  shouldAutoConsume: (workflow?: Workflow) => boolean;
  deferOtherDamage: (config: RollProcessConfig, dialog: RollDialogConfig) => boolean;
  rollOtherDamage: (config: RollProcessConfig, dialog: RollDialogConfig) => Promise<Roll[] | undefined>;
}

// 5e definitions, with midi special sauce(?)
export type DamageDescription = {
  value: number;
  type: string;
  properties: Set<string>;
  active?: {
    multiplier?: number;
    threshold?: boolean;
    // 5.2.x flat structure (set by dnd5e)
    modifications?: boolean;
    resistance?: boolean;
    vulnerability?: boolean;
    immunity?: boolean;
    // 5.3+ nested structure (set by dnd5e)
    all?: { modification?: boolean; resistance?: boolean; vulnerability?: boolean; immunity?: boolean };
    type?: { modification?: boolean; resistance?: boolean; vulnerability?: boolean; immunity?: boolean };
    // midi additions (always flat, set by midi-qol in both versions)
    absorption?: boolean;
    DR?: boolean;
    inlined?: boolean; // display-only DR entry; effect already distributed into individual entries
    spell?: boolean;
    magic?: boolean;
    nonmagic?: boolean;
    superSaver?: boolean;
    semiSuperSaver?: boolean;
    saved?: boolean;
    uncannyDodge?: boolean;
    [key: string]: any; // custom resistance type names
  };
  damage?: number;
  formula?: string;
  allActives?: string[];
  displayValue?: number; // original DR amount for tooltip display (when inlined)
  midiCategory?: "defaultDamage" | "otherDamage" | "bonusDamage";
  midiSaveMultiplier?: number;
  /** Other damage from the ammunition's activity rather than the item's other activity. */
  midiAmmunition?: boolean;
  /** Absorbed damage as dealt, before the target's own reductions (set before dnd5e's calculation). */
  midiAbsorbed?: { value: number; active?: DamageDescription["active"] };
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
    /** The minimum/maximum is midi's auto-success/fail, which forces the result without a natural crit/fumble */
    midiAutoResult?: "fail" | "success";
    advantage?: boolean;
    disadvantage?: boolean;
    advantageMode?: number;
    rollMode?: keyof CONFIG.Dice.RollModes;
  }
}

export type RollProcessConfig = {
  rolls?: BasicRollConfig[];
  evaluate?: boolean;
  event?: AugmentedEvent;
  hookNames?: string[];
  subject?: foundry.abstract.Document.Any;
  target?: number;
  ability?: string;
  ammunition?: Item.Implementation;
  workflow?: Workflow;
  midiOptions?: MidiOptions;
  advantageMode?: number;
  advantage?: boolean;
  disadvantage?: boolean;
  attackMode?: string;
  rollOptions?: WorkflowRollOptions
  isCritical?: boolean;
  workflowOptions?: WorkflowOptions
  skill?: string;
  tool?: string;
  bonus?: number | string;
  prof?: object;
  item?: Item.Implementation;
  rollMode?: keyof CONFIG.Dice.RollModes;
  simulate?: boolean;
  critical?: {
    allow: boolean;
  }
  flags?: unknown;
  scaling?: number | false;
};
export type RollDialogConfig = {
  configure?: boolean;
  applicationClass?: unknown;
  options?: {
    rollType?: string;
    default?: {
      rollMode?: keyof CONFIG.Dice.RollModes;
      buildConfig?: unknown;
      rendering?: unknown;
    };
    attackModeOptions?: string[];
    defaultButton?: string;
    advantageMode?: number;
    /** buildConfig callback for SkillTool/MidiRollChoiceDialog pattern */
    buildConfig?: (...args: any[]) => void;
    /** Multi-ability choice dialog: available roll choices */
    rollChoices?: unknown[];
    /** Multi-ability/skill choice dialog: pre-computed advantage per choice */
    advantageByChoice?: Record<string, unknown>;
    /** Choice dropdown type: "ability" for saves, "skill" for skill checks, "tool" for tool checks */
    choiceType?: "ability" | "skill" | "tool";
    /** Skill/tool choice dialog: the ability each choice rolls with */
    abilityForChoice?: (id: string) => string | undefined;
    window?: { subtitle?: string };
  };
};
/**
 * A dnd5e chat message, with the 6.0 accessors fvtt-types does not describe.
 *
 * dnd5e 6.0 moved the item/activity/actor a card came from out of `flags.dnd5e` and behind these
 * accessors on `ChatMessage5e` (`chat-message.mjs`). They are optional here because a world can be
 * running a dnd5e old enough not to have them.
 */
/**
 * `game.system` with dnd5e's additions. fvtt-types' `System` is a default-exported class, which a
 * module augmentation cannot extend, so this is applied as `(game.system as Dnd5eSystem)`.
 */
export type Dnd5eSystem = foundry.packages.System & {
  dice: {
    aggregateDamageRolls(rolls: Roll[], options?: { respectProperties?: boolean }): Roll[];
    DamageRoll: typeof Roll;
  };
};

/** Core v14 region members fvtt-types 13 lacks. */
export type V14RegionDocument = Omit<RegionDocument.Implementation, "shapes"> & {
  attachment: { token: string | null };
  shapes: Array<{
    origin: { x: number; y: number };
    clone(data: object, options: { parent: Scene.Implementation }):
      { move(origin: { x: number; y: number }): void; _source: RegionDocument.Source["shapes"][number] };
  }>;
};

/** Core v14's emanation region shape, which fvtt-types' shape union does not include. */
export type EmanationShapeData = {
  type: "emanation";
  radius: number;
  base: { type: string; x: number; y: number; width: number; height: number; shape?: number; rotation?: number };
};

export type Dnd5eChatMessage = ChatMessage.Implementation & {
  getAssociatedActivity?(options?: { scaled?: boolean }): Activity | undefined;
  getAssociatedActor?(): Actor.Implementation | undefined;
  getAssociatedItem?(options?: { scaled?: boolean }): Item.Implementation | undefined;
  getAssociatedRolls?(type: string): Roll[];
  getAssociatedToken?(): TokenDocument.Implementation | undefined;
};

/**
 * Render options passed down to `ChatMessageDataModel#_prepareContext`.
 *
 * `summary` is the only field the system itself reads — it selects `summaryTemplate` over
 * `template` in `render()`. Left open because the options object is forwarded from `renderHTML`,
 * where callers may add their own.
 */
export type ChatMessageRenderOptions = AnyObject & {
  summary?: boolean;
};

/**
 * The usage-card render context, as midi extends it.
 *
 * dnd5e supplies the rest (item, activity, description, subtitle, buttons, effects, summaries);
 * these are the decisions midi settles when the activity is used and stores on the card, because
 * they depend on a workflow that no longer exists by the time the card is re-rendered.
 */
export type MidiUsageChatContext = AnyMutableObject & {
  hasButtons?: boolean;
  hasAttack?: boolean;
  hasAttackRoll?: boolean;
  hasDamage?: boolean;
  hasEffects?: boolean;
  condensed?: boolean;
  mergeCardMulti?: boolean;
  confirmAttackDamage?: boolean;
  hideItemDetails?: boolean;
  displayProperties?: boolean;
  dmgBtnText?: string;
};

export type RollMessageConfig = {
  create?: boolean;
  document?: ChatMessage.Implementation;
  rollMode?: keyof CONFIG.Dice.RollModes;
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
    slot: string;
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

/** An entry of a usage card's `system.targets` (dnd5e's TargetsField): actor and token are uuids. */
export type DND5ETargetDescriptor = {
  name: string,
  img: string,
  actor: string,
  token?: string,
  ac: number | null,
};

export type MidiTargetDescriptor = {
  saved?: boolean;
  semiSuperSaver?: boolean;
  superSaver?: boolean;
  saveMults?: {
    otherDamage: number;
    defaultDamage: number;
    bonusDamage: number;
    ammunition?: number;
  };
  itemType?: string;
  uncannyDodge?: boolean;
  uncannyDodgeIcon?: string;
  flankingBonus?: number;
};

export type CombinedTargetDescriptor = MidiTargetDescriptor & DND5ETargetDescriptor;

// Save roll queueing types - used by queueTargetSaveRoll
export type SaveRollInfo = {
  type: string;
  abilities: string[];
  skills: string[];
  tools: string[];
  action: Function;
};


export type SaveDisplayOptions = {
  whisper: boolean;
  showRoll: boolean;
  showRollDialog: boolean;
  simulate: boolean;  // Required here, unlike optional in RollProcessConfig
};

export type SavePlayerInfo = {
  player: User | null | undefined;
  GMprompt: string;
  playerChat: boolean;
};

export type ModuleIntegrationFlags = {
  playerMonksTB: boolean;
  playerFlashTB: boolean;
  playerEpicRolls: boolean;
  gmMonksTB: boolean;
  gmFlashTB: boolean;
  gmRER: boolean;
};

/** Per-token entry for Monks Token Bar requestRoll.
 *  MTB's getTokenEntries only reads: token, advantage, disadvantage, request, fastForward.
 *  dc/showdc are read from the top-level options, not per-token.
 */
export type MonksTokenBarRequest = {
  token: string;
  advantage: boolean | undefined;
  disadvantage: boolean | undefined;
};

/** Per-token entry for Flash Rolls 5e requestRoll.
 *  dispatchFlashRollsSaves aggregates these into a single FlashAPI.requestRoll call,
 *  reading only: token, advantage, disadvantage.
 */
export type FlashRollsRequest = {
  token: string;
  advantage: boolean | undefined;
  disadvantage: boolean | undefined;
};

/** Per-token entry for Epic Rolls 5e requestRoll.
 *  dispatchEpicRollsSaves reads: actorUuid, advantage, disadvantage.
 *  DC, showDC, blindRoll etc. are set at the dispatch level from workflow properties.
 */
export type EpicRollsRequest = {
  actorUuid: string;
  advantage: boolean | undefined;
  disadvantage: boolean | undefined;
};

export type ModuleIntegrationRequests = {
  monks: { player: MonksTokenBarRequest[]; gm: MonksTokenBarRequest[] };
  flash: { player: FlashRollsRequest[]; gm: FlashRollsRequest[] };
  epic: { player: EpicRollsRequest[]; gm: EpicRollsRequest[] };
};

/** Pre-computed advantage data for a single choice (ability/skill/tool) */
export type PreComputedAdvantageData = {
  hasAdvantage: boolean;
  hasDisadvantage: boolean;
  defaultButton: "advantage" | "disadvantage" | "normal";
  /** RollModifierTracker instance (or plain object after socketlib serialization) */
  tracker?: RollModifierTracker | object;
};

export type SaveDetails = {
  actorUuid: string;  // UUID of the actor making the save - for reliable tracker lookup
  advantage: boolean | undefined;
  disadvantage: boolean | undefined;
  modifierTracker: RollModifierTracker | undefined;  // RollModifierTracker with attribution tracking
  isFriendly: boolean;
  isMagicSave: boolean;
  isConcentrationCheck: boolean | undefined;
  rollDC: number;
  saveItemUuid: string;
  saveActivityUuid?: string;
  workflowId: string;
  itemCardUuid: string;
  workflowOptions: object;
  /** Type of roll: "save", "check", "skill", or "tool" */
  rollType: string;
  /** Available abilities for multi-choice saves/checks */
  rollAbilities?: string[];
  /** Available skills for multi-choice skill checks */
  rollSkills?: string[];
  /** Available tools for multi-choice tool checks */
  rollTools?: string[];
  /** Activity's item ID */
  itemId: string;
  /** The save roll for this target */
  saveRoll?: Roll;
  /** Pre-computed advantage/disadvantage per choice (ability/skill/tool), for multi-choice dialogs.
   *  A roll is always ONE type (save, skill check, or tool check), so one object suffices.
   */
  advantageByChoice?: Record<string, PreComputedAdvantageData>;
};

export type ProcessTargetSaveContext = {
  rollDC: number | undefined;
  rollAbility: string | undefined;
  rollType: string | undefined;
  // v14: template placeable may not exist (Region-backed); use templateCoverOrigin for cover
  template: foundry.canvas.placeables.MeasuredTemplate.Implementation | undefined | null;
  templateCoverOrigin?: { x: number, y: number, elevation?: number };
  D20Roll: typeof Roll;
};

export type QueueSaveRollOptions = {
  target: Token;
  saveDetails: SaveDetails;
  rollInfo: SaveRollInfo;
  isMagicSave: boolean;
  displayOptions: SaveDisplayOptions;
  playerInfo: SavePlayerInfo;
  moduleFlags: ModuleIntegrationFlags;
  moduleRequests: ModuleIntegrationRequests;
};

